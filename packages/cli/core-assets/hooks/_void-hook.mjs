// src/enforcement/runner.ts
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync
} from "node:fs";
import {
  basename as basename2,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from "node:path";

// src/enforcement/normalize.ts
var MAX_FIELD_BYTES = 1024 * 1024;
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function safeString(value, label) {
  if (typeof value !== "string") return "";
  if (value.includes("\0") || Buffer.byteLength(value) > MAX_FIELD_BYTES) {
    throw new Error(`unsafe hook input: ${label}`);
  }
  return value;
}
function commandText(value) {
  if (Array.isArray(value)) return value.map((part) => safeString(part, "command")).join(" ");
  return safeString(value, "command");
}
function patchText(input) {
  const candidates = [
    input["patch"],
    input["input"],
    input["content"],
    input["command"]
  ];
  return candidates.map((value) => commandText(value)).filter((value) => value.includes("*** Begin Patch")).join("\n");
}
function parsePatchEdits(patch) {
  const edits = [];
  let path = "";
  let added = "";
  const emit = () => {
    if (path !== "") edits.push({ path, addedContent: added });
  };
  for (const line of patch.split(/\r?\n/)) {
    const section = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (section !== null) {
      emit();
      path = safeString(section[2] ?? "", "patch path");
      added = "";
      continue;
    }
    if (path !== "" && line.startsWith("+") && !line.startsWith("+++")) {
      added += `${line.slice(1)}
`;
    }
  }
  emit();
  return edits;
}
function normalizeToolCall(value) {
  const raw = record(value);
  if (raw === void 0) throw new Error("invalid hook input: expected object");
  const input = record(raw["tool_input"]) ?? {};
  const tool = safeString(raw["tool_name"], "tool_name");
  const command = commandText(input["command"]);
  const file = safeString(input["file_path"], "file_path");
  let edits;
  if (file !== "") {
    edits = [{
      path: file,
      addedContent: safeString(input["content"] ?? input["new_string"], "edit content")
    }];
  } else {
    edits = parsePatchEdits(patchText(input));
  }
  return { tool, command, edits };
}

// src/rules/verdict.ts
function allow(code3 = "ALLOW", message = "allowed") {
  return { allow: true, code: code3, message, evidence: [] };
}
function block(code3, message, evidence) {
  return { allow: false, code: code3, message, evidence };
}

// src/rules/dangerous-command.ts
var BRACED_HOME = `$${"{"}HOME}`;
var ROOT_TARGETS = /* @__PURE__ */ new Set([
  "/",
  "/*",
  "~",
  "~/",
  "~/*",
  "$HOME",
  "$HOME/",
  "$HOME/*",
  BRACED_HOME,
  `${BRACED_HOME}/`,
  `${BRACED_HOME}/*`,
  ".",
  "./",
  "./*",
  "*"
]);
function unquote(command) {
  return command.replaceAll('"', "").replaceAll("'", "");
}
function shellSegments(command) {
  return command.split(/&&|\|\||[;\n]/).map((segment) => segment.trim()).filter(Boolean);
}
function recursiveRootOperation(segment, operation) {
  const tokens = unquote(segment).split(/\s+/);
  const index = tokens.indexOf(operation);
  if (index < 0) return false;
  const args = tokens.slice(index + 1);
  const recursive = args.some(
    (token) => token === "--recursive" || /^-[A-Za-z]*R[A-Za-z]*$/.test(token) || /^-[A-Za-z]*r[A-Za-z]*$/.test(token)
  );
  if (!recursive) return false;
  return args.some((target) => ROOT_TARGETS.has(target));
}
function violation(command) {
  if (/:\(\)\s*\{\s*:\s*\|\s*:/.test(command)) return "fork bomb";
  if (/(^|\s)mkfs(?:\.[a-z0-9]+)?(?:\s|$)/i.test(command)) return "filesystem / raw-device write";
  if (/(^|\s)dd\b[^|]*\bof=\/dev\//i.test(command) || />\s*\/dev\/(?:sd|nvme|hd|disk)/i.test(command)) {
    return "raw-device write";
  }
  if (/\b(?:drop\s+(?:database|table|schema)|truncate\s+table)\b/i.test(command)) {
    return "destructive SQL (DROP / TRUNCATE)";
  }
  for (const segment of shellSegments(command)) {
    if (recursiveRootOperation(segment, "rm")) return "recursive delete of a root path";
    if (recursiveRootOperation(segment, "chmod") || recursiveRootOperation(segment, "chown")) {
      return "recursive permission/ownership change on a root path";
    }
    if (/\bgit\s+push\b/.test(segment) && /(?:^|\s)(?:--force(?:\s|$)|-f(?:\s|$))/.test(segment) && !/--force-with-lease/.test(segment)) {
      return "git push --force (use --force-with-lease)";
    }
    if (/\bgit(?:\s+-\S+)*\s+(?:rebase|am|apply|cherry-pick)\b/.test(segment) && /(?:--exec(?:\s|=|$)|--rebase-merges|--strategy-option|--unsafe-paths)/.test(segment)) {
      return "git command-execution / unsafe-path flag";
    }
  }
  return void 0;
}
function dangerousCommand(command) {
  const evidence = violation(command);
  return evidence === void 0 ? allow() : block(
    "DANGEROUS_COMMAND",
    "refusing a destructive command; use the reviewed one-shot override only when deliberate",
    [evidence]
  );
}

// src/rules/protected-file.ts
import { basename } from "node:path";
function protectedReason(path) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const base = basename(normalized);
  if (/^\.env(?:\..+)?$/.test(base) && !/\.(?:example|sample|template|dist)$/.test(base)) {
    return "environment file with secrets";
  }
  if (/\.(?:pem|key|p12|pfx|keystore|jks|asc)$/.test(base) || /^id_(?:rsa|ed25519|ecdsa|dsa)$/.test(base)) {
    return "private key / certificate";
  }
  if (/(?:\.npmrc|\.netrc|\.pgpass)$/.test(base)) return "credential file";
  if (!base.endsWith(".md") && /(?:secret|credential)/.test(base)) return "credential file";
  if ((/* @__PURE__ */ new Set([
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "cargo.lock",
    "poetry.lock",
    "composer.lock"
  ])).has(base)) {
    return "lockfile (regenerate via the package manager, do not hand-edit)";
  }
  if (/(^|\/)\.git\//.test(normalized)) return "internal git metadata";
  return void 0;
}
function protectedFile(paths) {
  for (const path of paths) {
    const reason = protectedReason(path);
    if (reason !== void 0) {
      return block("PROTECTED_FILE", `refusing to edit ${path}`, [`${path}: ${reason}`]);
    }
  }
  return allow();
}

// src/rules/secret-content.ts
var HIGH_CONFIDENCE = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}/,
  /\bgh[posru]_[A-Za-z0-9]{36}/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/,
  /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{40,}\b/,
  /\bsk-[A-Za-z0-9]{40,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
var GENERIC_ASSIGNMENT = /(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_APIKEY)["' ]*[:=]\s*["']([A-Za-z0-9+/=_-]{24,})["']/i;
var PLACEHOLDER = /process\.env|import\.meta\.env|xxx|changeme|example|redacted|your[-_]|<[a-z]|placeholder|todo/i;
var EXEMPT_PATH = /\.(?:test|spec)\.|\/__tests__\/|\/__fixtures__\/|\/fixtures\/|\/__generated__\//;
function lineHasSecret(line) {
  if (line.includes("allow-secret-pattern:")) return false;
  if (HIGH_CONFIDENCE.some((pattern) => pattern.test(line))) return true;
  const assignment = line.match(GENERIC_ASSIGNMENT);
  if (assignment === null || PLACEHOLDER.test(line)) return false;
  const value = assignment[1] ?? "";
  if (/^[0-9a-f]+$/i.test(value) || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    return false;
  }
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}
function secretContent(edits) {
  const evidence = [];
  for (const edit of edits) {
    if (EXEMPT_PATH.test(edit.path.replaceAll("\\", "/"))) continue;
    edit.addedContent.split(/\r?\n/).forEach((line, index) => {
      if (lineHasSecret(line)) evidence.push(`${edit.path}:${index + 1}`);
    });
  }
  return evidence.length === 0 ? allow() : block("SECRET_IN_CONTENT", "secret-in-content: likely secret detected in edited content", evidence);
}

// src/rules/tdd-order.ts
function globRegExp(glob) {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? "";
    if (char === "*" && glob[index + 1] === "*") {
      pattern += ".*";
      index += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${pattern}$`);
}
function matches(path, globs) {
  return globs.some((glob) => globRegExp(glob).test(path));
}
function bypass(path, spikeGlobs) {
  return /\.(?:md|mdx|txt)$/.test(path) || /(^|\/)docs\//.test(path) || /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path) || /\.d\.ts$/.test(path) || /\/(?:tests?|__tests__)\/fixtures\/|\/seed\/|\/migrations\/|\/drizzle\/meta\/|\/codemods?\//.test(path) || /\/__generated__\//.test(path) || matches(path, spikeGlobs);
}
function fileMode(path, input) {
  const header = (input.existingHeaders[path] ?? "").split(/\r?\n/).slice(0, 5).join("\n");
  const marker = header.match(/\/\/\s*tdd-mode:\s*(strict|souple|exploratory)/)?.[1];
  return marker === "strict" || marker === "souple" || marker === "exploratory" ? marker : input.mode;
}
function siblingFor(path) {
  if (path.endsWith(".tsx")) return `${path.slice(0, -4)}.test.tsx`;
  if (path.endsWith(".ts")) return `${path.slice(0, -3)}.test.ts`;
  if (path.endsWith(".jsx")) return `${path.slice(0, -4)}.test.jsx`;
  if (path.endsWith(".js")) return `${path.slice(0, -3)}.test.js`;
  return `${path}.test`;
}
function tddOrder(input) {
  const warnings = [];
  for (const edit of input.edits) {
    const path = edit.path.replaceAll("\\", "/");
    if (bypass(path, input.spikeGlobs) || !matches(path, input.businessGlobs)) continue;
    const mode = fileMode(path, input);
    if (mode === "exploratory") continue;
    const sibling = siblingFor(path);
    if (input.siblingTests.has(sibling)) continue;
    const evidence = `${path} -> ${sibling}`;
    if (mode === "souple") {
      warnings.push(evidence);
      continue;
    }
    return block(
      "TDD_SIBLING_TEST_MISSING",
      "missing sibling test: production edit requires one in strict/auto mode",
      [evidence]
    );
  }
  return warnings.length === 0 ? allow() : {
    allow: true,
    code: "TDD_SIBLING_TEST_WARNING",
    message: "warning: souple mode, sibling test missing",
    evidence: warnings
  };
}

// src/enforcement/runner.ts
var MAX_HOOK_INPUT_BYTES = 1024 * 1024;
function containsNul(value) {
  if (typeof value === "string") return value.includes("\0");
  if (Array.isArray(value)) return value.some((item) => containsNul(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((item) => containsNul(item));
}
function parseHookText(input) {
  if (input.byteLength > MAX_HOOK_INPUT_BYTES) {
    throw new Error("HOOK_INPUT_TOO_LARGE");
  }
  const text2 = new TextDecoder("utf-8", { fatal: true }).decode(input);
  if (text2.includes("\0")) throw new Error("HOOK_INPUT_BINARY");
  return text2;
}
function parseHookPayload(input) {
  const text2 = parseHookText(input);
  const parsed = JSON.parse(text2);
  if (containsNul(parsed)) throw new Error("HOOK_INPUT_BINARY");
  return parsed;
}
function physicalPath(path) {
  const absolute = resolve(path);
  let existing = absolute;
  const suffix = [];
  while (true) {
    try {
      return join(realpathSync(existing), ...suffix);
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return absolute;
      suffix.unshift(basename2(existing));
      existing = parent;
    }
  }
}
function discoverProjectRoot(start) {
  let current = physicalPath(start);
  while (true) {
    if (existsSync(join(current, ".void", "config.json")) || existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return physicalPath(start);
    current = parent;
  }
}
function projectRelativePath(root, path) {
  const physicalRoot = physicalPath(root);
  const absolute = physicalPath(isAbsolute(path) ? path : resolve(physicalRoot, path));
  const projectPath = relative(physicalRoot, absolute).replaceAll("\\", "/");
  return projectPath === ".." || projectPath.startsWith("../") || isAbsolute(projectPath) ? void 0 : projectPath;
}
function projectEdits(root, edits) {
  return edits.flatMap((edit) => {
    const path = projectRelativePath(root, edit.path);
    return path === void 0 ? [] : [{ ...edit, path }];
  });
}
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function configuredString(parent, key, fallback) {
  const value = parent?.[key];
  return typeof value === "string" ? value : fallback;
}
function readTddConfig(root) {
  let config = {};
  try {
    config = record2(JSON.parse(readFileSync(join(root, ".void/config.json"), "utf8"))) ?? {};
  } catch {
  }
  const modes = record2(config["modes"]);
  const paths = record2(config["paths"]);
  const configuredMode = configuredString(modes, "tdd", "auto");
  const mode = configuredMode === "strict" || configuredMode === "souple" || configuredMode === "exploratory" ? configuredMode : "auto";
  return {
    mode,
    businessGlob: configuredString(paths, "business", "apps/*/src/**"),
    spikesGlob: configuredString(paths, "spikes", "apps/*/scripts/spike-*")
  };
}
function readHeader(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    const buffer = Buffer.alloc(8192);
    const bytes = readSync(descriptor, buffer, 0, buffer.byteLength, 0);
    return buffer.subarray(0, bytes).toString("utf8");
  } catch {
    return "";
  } finally {
    if (descriptor !== void 0) closeSync(descriptor);
  }
}
function tddVerdict(root, edits) {
  const physicalRoot = physicalPath(root);
  const projectChanges = projectEdits(physicalRoot, edits);
  const config = readTddConfig(physicalRoot);
  const existingHeaders = {};
  const siblingTests = /* @__PURE__ */ new Set();
  for (const edit of projectChanges) {
    existingHeaders[edit.path] = readHeader(join(physicalRoot, edit.path));
    for (const sibling of [
      edit.path.replace(/\.tsx$/, ".test.tsx"),
      edit.path.replace(/\.ts$/, ".test.ts"),
      edit.path.replace(/\.jsx$/, ".test.jsx"),
      edit.path.replace(/\.js$/, ".test.js")
    ]) {
      if (sibling !== edit.path && existsSync(join(physicalRoot, sibling))) {
        siblingTests.add(sibling);
      }
    }
  }
  return tddOrder({
    edits: projectChanges,
    mode: config.mode,
    businessGlobs: [config.businessGlob],
    spikeGlobs: [config.spikesGlob],
    existingHeaders,
    siblingTests
  });
}
function evaluateRule(rule, rawInput, options) {
  const call = normalizeToolCall(rawInput);
  const env = options.env ?? process.env;
  if (rule === "dangerous-command") {
    if (call.tool !== "Bash" && call.tool !== "shell") return allow();
    if (env["VOID_HARNESS_ALLOW_DANGEROUS"] === "1") return allow("OVERRIDE", "one-shot override");
    return dangerousCommand(call.command);
  }
  if (call.tool !== "Edit" && call.tool !== "Write" && call.tool !== "apply_patch" && call.tool !== "Bash" && call.tool !== "shell") {
    return allow();
  }
  if (rule === "protected-file") {
    if (env["VOID_HARNESS_ALLOW_SECRET_EDIT"] === "1") return allow("OVERRIDE", "one-shot override");
    return protectedFile(call.edits.map((edit) => edit.path));
  }
  if (rule === "secret-content") return secretContent(call.edits);
  if (rule === "tdd-order") return tddVerdict(options.root, call.edits);
  rule;
  throw new Error("UNKNOWN_ENFORCEMENT_RULE");
}

// src/record.ts
import { homedir } from "node:os";
import { resolve as resolve5 } from "node:path";

// src/runtime-input.ts
import { createHash } from "node:crypto";
import {
  basename as basename3,
  extname,
  isAbsolute as isAbsolute2,
  relative as relative2,
  resolve as resolve2
} from "node:path";
var MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
function record3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function text(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  let clean = "";
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0;
    if (point >= 32 && point !== 127) clean += char;
    if (clean.length >= 256) break;
  }
  return clean.slice(0, 256);
}
function runtimeSession(raw) {
  return text(
    raw["session_id"] ?? raw["sessionId"] ?? raw["thread_id"] ?? raw["threadId"]
  );
}
function categoryFor(tool) {
  if (tool === "Skill") return "skill";
  if (tool === "Task" || tool === "Agent") return "agent";
  if (tool === "Workflow") return "workflow";
  return "tool";
}
function nameFor(tool, category, input) {
  if (category === "skill") {
    return text(input["skill"] ?? input["name"], "unknown");
  }
  if (category === "agent") {
    return text(
      input["subagent_type"] ?? input["agent"],
      tool === "Agent" ? "claude" : "unknown"
    );
  }
  if (category === "workflow") {
    const explicit = text(input["name"]);
    if (explicit !== "") return explicit;
    const script = text(input["scriptPath"]);
    return script === "" || script.endsWith("/") ? "inline" : basename3(script).replace(/(?:\.workflow)?\.js$/, "") || "inline";
  }
  return tool || "unknown";
}
function safePaths(input, root) {
  const absoluteRoot = resolve2(root);
  const candidates = [
    input["file_path"],
    input["path"],
    input["pattern"]
  ];
  const paths = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 2e3) continue;
    if (!isAbsolute2(candidate)) {
      if (!candidate.startsWith("..")) paths.push(candidate.slice(0, 500));
      continue;
    }
    const rel = relative2(absoluteRoot, resolve2(candidate));
    if (rel !== "" && !rel.startsWith("..") && !isAbsolute2(rel)) {
      paths.push(rel.slice(0, 500));
    }
  }
  return paths;
}
function outcomeStatus(raw) {
  const response = record3(raw["tool_response"]);
  if (response === void 0) return "unknown";
  if (response["success"] === false || response["is_error"] === true || response["error"] !== void 0) {
    return "error";
  }
  return "ok";
}
function adaptRuntimeInput(value, options) {
  const raw = record3(value);
  if (raw === void 0) return void 0;
  const runtimeSessionId = runtimeSession(raw);
  if (options.phase === "stop" || text(raw["hook_event_name"]) === "Stop") {
    return {
      runtimeSessionId,
      source: `runtime:${options.runtime}`,
      kind: "runtime.session.stopped",
      subject: `runtime:${options.runtime}`,
      payload: {}
    };
  }
  const tool = text(raw["tool_name"], "unknown");
  const input = record3(raw["tool_input"]) ?? {};
  const category = categoryFor(tool);
  const name = nameFor(tool, category, input);
  const fileGlobs = safePaths(input, options.root);
  const extensions = fileGlobs.map((path) => extname(path).slice(1)).filter((extension) => extension !== "");
  return {
    runtimeSessionId,
    source: `runtime:${options.runtime}`,
    kind: options.phase === "outcome" ? "runtime.tool.completed" : "runtime.tool.started",
    subject: `${category}:${name}`,
    payload: {
      category,
      tool,
      fileGlobs,
      extensions,
      ...options.phase === "outcome" ? { status: outcomeStatus(raw) } : {}
    }
  };
}
function deriveMissionId(explicit, runtime2, runtimeSessionId, root) {
  if (explicit !== void 0 && explicit !== "") {
    if (!MISSION_ID.test(explicit)) {
      throw new Error("HOOK_INVALID_MISSION_ID: expected mis_<opaque-id>");
    }
    return explicit;
  }
  const opaque = createHash("sha256").update(`${runtime2}\0${runtimeSessionId || "unknown"}\0${resolve2(root)}`).digest("hex").slice(0, 32);
  return `mis_${opaque}`;
}

// src/sequenced-writer.ts
import { randomUUID as nodeRandomUUID } from "node:crypto";
import {
  constants
} from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink
} from "node:fs/promises";
import {
  dirname as dirname2,
  isAbsolute as isAbsolute3,
  join as join2,
  relative as relative3,
  resolve as resolve3
} from "node:path";

// ../mission-engine/dist/events/schema.js
var MAX_EVENT_PAYLOAD_BYTES = 16 * 1024;
var MAX_EVENT_LINE_BYTES = 32 * 1024;
var MAX_EVENT_PAYLOAD_DEPTH = 8;
var MAX_EVENT_PAYLOAD_NODES = 512;
var EVENT_ID = /^evt_[A-Za-z0-9_-]{8,100}$/;
var MISSION_ID2 = /^mis_[A-Za-z0-9_-]{8,100}$/;
var DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
var EVENT_KIND = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;
var EVENT_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "seq",
  "eventId",
  "missionId",
  "ts",
  "source",
  "kind",
  "subject",
  "causationId",
  "correlationId",
  "payload"
]);
function utf8Bytes(value) {
  let bytes = 0;
  for (const char of value) {
    const code3 = char.codePointAt(0) ?? 0;
    bytes += code3 <= 127 ? 1 : code3 <= 2047 ? 2 : code3 <= 65535 ? 3 : 4;
  }
  return bytes;
}
function isPrintable(value) {
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0;
    if (point < 32 || point === 127)
      return false;
  }
  return true;
}
function record4(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return void 0;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : void 0;
}
function isJsonValue(value, depth, budget) {
  budget.nodes += 1;
  if (depth > MAX_EVENT_PAYLOAD_DEPTH || budget.nodes > MAX_EVENT_PAYLOAD_NODES) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number")
    return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1, budget));
  }
  const object = record4(value);
  if (object === void 0)
    return false;
  return Object.entries(object).every(([key, entry]) => key.length <= 100 && isPrintable(key) && isJsonValue(entry, depth + 1, budget));
}
function boundedLabel(value, min, max, pattern) {
  return typeof value === "string" && value.length >= min && value.length <= max && isPrintable(value) && (pattern === void 0 || pattern.test(value));
}
function contractError(message) {
  return {
    ok: false,
    issue: { code: "invalid-event-contract", message }
  };
}
function parseEvent(value) {
  const raw = record4(value);
  if (raw === void 0)
    return contractError("event must be a plain object");
  const unknownKeys = Object.keys(raw).filter((key) => !EVENT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return contractError(`unknown field(s): ${unknownKeys.join(", ")}`);
  }
  if (raw["schemaVersion"] !== 1)
    return contractError("schemaVersion must be 1");
  if (typeof raw["seq"] !== "number" || !Number.isSafeInteger(raw["seq"]) || raw["seq"] <= 0) {
    return contractError("seq must be a positive safe integer");
  }
  if (!boundedLabel(raw["eventId"], 12, 104, EVENT_ID)) {
    return contractError("eventId must be evt_<opaque-id>");
  }
  if (!boundedLabel(raw["missionId"], 12, 104, MISSION_ID2)) {
    return contractError("missionId must be mis_<opaque-id>");
  }
  if (!boundedLabel(raw["ts"], 20, 24, DATE_TIME)) {
    return contractError("ts must be an ISO UTC timestamp");
  }
  if (!boundedLabel(raw["source"], 1, 128)) {
    return contractError("source must be a bounded label");
  }
  if (!boundedLabel(raw["kind"], 3, 128, EVENT_KIND)) {
    return contractError("kind must be a dotted event name");
  }
  if (!boundedLabel(raw["subject"], 1, 256)) {
    return contractError("subject must be a bounded label");
  }
  if (raw["causationId"] !== void 0 && !boundedLabel(raw["causationId"], 12, 104, EVENT_ID)) {
    return contractError("causationId must be evt_<opaque-id>");
  }
  if (!boundedLabel(raw["correlationId"], 12, 104, MISSION_ID2)) {
    return contractError("correlationId must be mis_<opaque-id>");
  }
  if (!isJsonValue(raw["payload"], 0, { nodes: 0 })) {
    return contractError("payload must be bounded JSON data");
  }
  if (utf8Bytes(JSON.stringify(raw["payload"])) > MAX_EVENT_PAYLOAD_BYTES) {
    return contractError(`payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`);
  }
  const required = {
    schemaVersion: 1,
    seq: raw["seq"],
    eventId: raw["eventId"],
    missionId: raw["missionId"],
    ts: raw["ts"],
    source: raw["source"],
    kind: raw["kind"],
    subject: raw["subject"],
    correlationId: raw["correlationId"],
    payload: raw["payload"]
  };
  return {
    ok: true,
    value: {
      ...required,
      ...raw["causationId"] === void 0 ? {} : { causationId: raw["causationId"] }
    }
  };
}
function parseEventLine(line) {
  if (utf8Bytes(line) > MAX_EVENT_LINE_BYTES) {
    return {
      ok: false,
      issue: {
        code: "event-line-too-large",
        message: `event line exceeds ${MAX_EVENT_LINE_BYTES} bytes`
      }
    };
  }
  let raw;
  try {
    raw = JSON.parse(line);
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid-event-json",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
  return parseEvent(raw);
}
function serializeEvent(event) {
  const parsed = parseEvent(event);
  if (!parsed.ok)
    throw new Error(`EVENT_INVALID: ${parsed.issue.message}`);
  const line = JSON.stringify(parsed.value);
  if (utf8Bytes(line) > MAX_EVENT_LINE_BYTES) {
    throw new Error(`EVENT_LINE_TOO_LARGE: exceeds ${MAX_EVENT_LINE_BYTES} bytes`);
  }
  return line;
}

// ../mission-engine/dist/events/reducer.js
function replayEventLog(text2) {
  const events = [];
  const eventIds = /* @__PURE__ */ new Set();
  const sequences = /* @__PURE__ */ new Set();
  const issues = [];
  let lastSeq = 0;
  let continuity = "empty";
  let duplicateEventIds = 0;
  let invalidLines = 0;
  const lines = text2.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "")
      continue;
    const parsed = parseEventLine(line);
    if (parsed.ok) {
      const event = parsed.value;
      if (eventIds.has(event.eventId)) {
        duplicateEventIds += 1;
        continue;
      }
      eventIds.add(event.eventId);
      events.push(event);
      continuity = continuity === "empty" ? "complete" : continuity;
      if (sequences.has(event.seq)) {
        issues.push({ code: "duplicate-sequence", seq: event.seq });
        continuity = "partial";
      } else {
        const expectedSeq = lastSeq + 1;
        if (event.seq > expectedSeq) {
          issues.push({
            code: "sequence-gap",
            expectedSeq,
            actualSeq: event.seq
          });
          continuity = "partial";
        } else if (event.seq < expectedSeq) {
          issues.push({
            code: "out-of-order-sequence",
            previousSeq: lastSeq,
            actualSeq: event.seq
          });
          continuity = "partial";
        }
        sequences.add(event.seq);
      }
      lastSeq = Math.max(lastSeq, event.seq);
    } else {
      continuity = "partial";
      invalidLines += 1;
      issues.push({
        code: "invalid-event-line",
        line: index + 1,
        detail: `${parsed.issue.code}: ${parsed.issue.message}`
      });
    }
  }
  return {
    events,
    eventIds,
    sequences,
    lastSeq,
    continuity,
    duplicateEventIds,
    invalidLines,
    issues
  };
}

// src/sequenced-writer.ts
var MAX_EVENT_LOG_BYTES = 8 * 1024 * 1024;
var MISSION_ID3 = /^mis_[A-Za-z0-9_-]{8,100}$/;
var DEFAULT_LOCK_STALE_MS = 3e4;
var DEFAULT_LOCK_ATTEMPTS = 2e3;
var LOCK_RETRY_MS = 2;
function code(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function within(root, target) {
  const rel = relative3(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute3(rel);
}
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (code(error) === "ENOENT") return false;
    throw error;
  }
}
async function safeRunDirectory(root, missionId) {
  if (!MISSION_ID3.test(missionId)) {
    throw new Error("HOOK_INVALID_MISSION_ID: expected mis_<opaque-id>");
  }
  const absoluteRoot = resolve3(root);
  const canonicalRoot = await realpath(absoluteRoot);
  const run = join2(absoluteRoot, ".void", "runs", missionId);
  let ancestor = run;
  while (!await exists(ancestor)) {
    const parent = dirname2(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const canonicalAncestor = await realpath(ancestor);
  if (!within(canonicalRoot, canonicalAncestor)) {
    throw new Error("HOOK_PATH_ESCAPE: run directory resolves outside project");
  }
  await mkdir(run, { recursive: true, mode: 448 });
  const canonicalRun = await realpath(run);
  if (!within(canonicalRoot, canonicalRun)) {
    throw new Error("HOOK_PATH_ESCAPE: run directory resolves outside project");
  }
  return run;
}
async function rejectSymlink(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`HOOK_UNSAFE_FILE: ${path} must be a regular file`);
    }
  } catch (error) {
    if (code(error) !== "ENOENT") throw error;
  }
}
async function wait(ms) {
  await new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}
async function acquireLock(path, staleMs, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = nodeRandomUUID();
    try {
      const handle = await open(path, "wx", 384);
      try {
        await handle.writeFile(
          JSON.stringify({ token, pid: process.pid, acquiredAt: Date.now() }),
          "utf8"
        );
      } finally {
        await handle.close();
      }
      return { path, token };
    } catch (error) {
      if (code(error) !== "EEXIST") throw error;
      const info = await lstat(path).catch((statError) => {
        if (code(statError) === "ENOENT") return void 0;
        throw statError;
      });
      if (info === void 0) continue;
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error("HOOK_UNSAFE_LOCK: lock must be a regular file");
      }
      if (Date.now() - info.mtimeMs > staleMs) {
        await unlink(path).catch((unlinkError) => {
          if (code(unlinkError) !== "ENOENT") throw unlinkError;
        });
        continue;
      }
      await wait(LOCK_RETRY_MS);
    }
  }
  throw new Error("HOOK_LOCK_TIMEOUT: event sequencer remained busy");
}
async function releaseLock(lock) {
  try {
    const raw = await readFile(lock.path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.token === lock.token) await unlink(lock.path);
  } catch (error) {
    if (code(error) !== "ENOENT") throw error;
  }
}
async function readSequenceState(statePath, logPath, logBytes) {
  try {
    const raw = JSON.parse(await readFile(statePath, "utf8"));
    if (Number.isSafeInteger(raw.seq) && (raw.seq ?? -1) >= 0 && raw.logBytes === logBytes) {
      return raw.seq ?? 0;
    }
  } catch {
  }
  if (logBytes === 0) return 0;
  return replayEventLog(await readFile(logPath, "utf8")).lastSeq;
}
async function ensureLineBoundary(logPath, logBytes) {
  if (logBytes === 0) return 0;
  const handle = await open(logPath, "r");
  try {
    const finalByte = Buffer.alloc(1);
    await handle.read(finalByte, 0, 1, logBytes - 1);
    if (finalByte[0] === 10) return logBytes;
  } finally {
    await handle.close();
  }
  const append = await open(
    logPath,
    constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    await append.writeFile("\n", "utf8");
  } finally {
    await append.close();
  }
  return logBytes + 1;
}
async function appendLine(logPath, line) {
  const flags = constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(logPath, flags, 384);
  try {
    await handle.writeFile(`${line}
`, "utf8");
    return (await handle.stat()).size;
  } finally {
    await handle.close();
  }
}
async function writeSequenceState(statePath, state, randomUUID) {
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 384);
  try {
    await handle.writeFile(JSON.stringify(state), "utf8");
  } finally {
    await handle.close();
  }
  await rename(temporary, statePath);
}
async function writeSequencedEvent(options) {
  const run = await safeRunDirectory(options.root, options.missionId);
  const logPath = join2(run, "events.jsonl");
  const statePath = join2(run, ".seq.state");
  const lockPath = join2(run, ".seq.lock");
  await Promise.all([
    rejectSymlink(logPath),
    rejectSymlink(statePath),
    rejectSymlink(lockPath)
  ]);
  const lock = await acquireLock(
    lockPath,
    options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS,
    options.lockAttempts ?? DEFAULT_LOCK_ATTEMPTS
  );
  const randomUUID = options.randomUUID ?? nodeRandomUUID;
  try {
    await rejectSymlink(logPath);
    const currentBytes = await stat(logPath).then((value) => value.size).catch((error) => {
      if (code(error) === "ENOENT") return 0;
      throw error;
    });
    if (currentBytes >= MAX_EVENT_LOG_BYTES) {
      throw new Error("HOOK_EVENT_LOG_FULL: rotate or archive the run");
    }
    const boundedBytes = await ensureLineBoundary(logPath, currentBytes);
    const previousSeq = await readSequenceState(
      statePath,
      logPath,
      boundedBytes
    );
    const event = {
      schemaVersion: 1,
      seq: previousSeq + 1,
      eventId: `evt_${randomUUID()}`,
      missionId: options.missionId,
      ts: (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
      ...options.draft
    };
    const line = serializeEvent(event);
    if (boundedBytes + Buffer.byteLength(line) + 1 > MAX_EVENT_LOG_BYTES) {
      throw new Error("HOOK_EVENT_LOG_FULL: rotate or archive the run");
    }
    const logBytes = await appendLine(logPath, line);
    await writeSequenceState(
      statePath,
      { seq: event.seq, logBytes },
      randomUUID
    );
    return event;
  } finally {
    await releaseLock(lock);
  }
}

// src/project-registry.ts
import { createHash as createHash2 } from "node:crypto";
import { lstat as lstat2, mkdir as mkdir2, open as open2, readFile as readFile2, realpath as realpath2 } from "node:fs/promises";
import { isAbsolute as isAbsolute4, join as join3, relative as relative4, resolve as resolve4 } from "node:path";
function code2(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function within2(root, target) {
  const rel = relative4(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute4(rel);
}
async function registerProjectRoot(root, globalDir) {
  const canonicalRoot = await realpath2(resolve4(root));
  const base = resolve4(globalDir);
  await mkdir2(base, { recursive: true, mode: 448 });
  const canonicalBase = await realpath2(base);
  const projects = join3(base, "projects");
  await mkdir2(projects, { recursive: true, mode: 448 });
  const info = await lstat2(projects);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("HOOK_UNSAFE_REGISTRY: projects must be a real directory");
  }
  const canonicalProjects = await realpath2(projects);
  if (!within2(canonicalBase, canonicalProjects)) {
    throw new Error("HOOK_REGISTRY_ESCAPE: projects resolves outside global dir");
  }
  const slug = createHash2("sha256").update(canonicalRoot).digest("hex").slice(0, 32);
  const pointer = join3(projects, `${slug}.path`);
  try {
    const handle = await open2(pointer, "wx", 384);
    try {
      await handle.writeFile(`${canonicalRoot}
`, "utf8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (code2(error) !== "EEXIST") throw error;
    const pointerInfo = await lstat2(pointer);
    if (!pointerInfo.isFile() || pointerInfo.isSymbolicLink()) {
      throw new Error("HOOK_UNSAFE_REGISTRY: pointer must be a regular file");
    }
    if ((await readFile2(pointer, "utf8")).trim() !== canonicalRoot) {
      throw new Error("HOOK_REGISTRY_COLLISION: pointer owns another root");
    }
  }
}

// src/record.ts
async function recordRuntimeEvent(options) {
  const adapted = adaptRuntimeInput(options.rawInput, options);
  if (adapted === void 0) return void 0;
  const missionId = deriveMissionId(
    options.missionId,
    options.runtime,
    adapted.runtimeSessionId,
    options.root
  );
  const draft = {
    source: adapted.source,
    kind: adapted.kind,
    subject: adapted.subject,
    correlationId: missionId,
    payload: adapted.payload
  };
  const event = await writeSequencedEvent({
    root: options.root,
    missionId,
    draft
  });
  await registerProjectRoot(
    options.root,
    options.globalDir ?? resolve5(homedir(), ".void")
  ).catch(() => {
  });
  return event;
}
function runtime(value) {
  return value === "claude" || value === "codex" ? value : "unknown";
}
function phase(value) {
  if (value === "outcome" || value === "stop") return value;
  return "activation";
}
async function recordRuntimeEventFromCli(raw, argv, env) {
  await recordRuntimeEvent({
    root: env["VOID_PROJECT_ROOT"] ?? env["CLAUDE_PROJECT_DIR"] ?? process.cwd(),
    runtime: runtime(argv[3] ?? env["VOID_AGENT_RUNTIME"]),
    phase: phase(argv[2]),
    rawInput: raw,
    globalDir: env["VOID_GLOBAL_DIR"] ?? resolve5(homedir(), ".void"),
    ...env["VOID_MISSION_ID"] === void 0 ? {} : { missionId: env["VOID_MISSION_ID"] }
  });
}

// src/cli.ts
var RULES = /* @__PURE__ */ new Set([
  "dangerous-command",
  "protected-file",
  "secret-content",
  "tdd-order"
]);
async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    bytes += chunk.byteLength;
    if (bytes > MAX_HOOK_INPUT_BYTES) throw new Error("HOOK_INPUT_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function writeVerdict(verdict, write) {
  if (verdict.code === "ALLOW" || verdict.code === "OVERRIDE") return;
  const evidence = verdict.evidence.length === 0 ? "" : `
${verdict.evidence.map((item) => `- ${item}`).join("\n")}`;
  write(`${verdict.code}: ${verdict.message}${evidence}
`);
}
async function main() {
  const input = await readStdin();
  if (process.argv[2] !== "enforce" && process.argv[2] !== "enforce-ci") {
    try {
      await recordRuntimeEventFromCli(
        parseHookPayload(input),
        process.argv,
        process.env
      );
    } catch {
    }
    return;
  }
  try {
    const rule = process.argv[3];
    if (!RULES.has(rule)) throw new Error("UNKNOWN_ENFORCEMENT_RULE");
    const rawInput = process.argv[2] === "enforce-ci" ? {
      tool_name: "Write",
      tool_input: {
        file_path: process.argv[4] ?? "",
        content: parseHookText(input)
      }
    } : parseHookPayload(input);
    const verdict = evaluateRule(
      rule,
      rawInput,
      {
        root: process.env["VOID_PROJECT_ROOT"] ?? process.env["CLAUDE_PROJECT_DIR"] ?? discoverProjectRoot(process.cwd()),
        env: process.env
      }
    );
    writeVerdict(verdict, (message) => process.stderr.write(message));
    if (!verdict.allow) process.exitCode = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ENFORCEMENT_ERROR";
    process.stderr.write(`HOOK_INPUT_REJECTED: ${message}
`);
    process.exitCode = 2;
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : "UNKNOWN_ENFORCEMENT_ERROR";
  process.stderr.write(`HOOK_RUNNER_FAILED: ${message}
`);
  process.exitCode = process.argv[2] === "enforce" ? 2 : 0;
});
