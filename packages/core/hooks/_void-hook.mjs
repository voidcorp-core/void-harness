// src/record.ts
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { resolve as resolve4 } from "node:path";

// src/runtime-input.ts
import { createHash } from "node:crypto";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve
} from "node:path";
var MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
function record(value) {
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
    return script === "" || script.endsWith("/") ? "inline" : basename(script).replace(/(?:\.workflow)?\.js$/, "") || "inline";
  }
  return tool || "unknown";
}
function safePaths(input, root) {
  const absoluteRoot = resolve(root);
  const candidates = [
    input["file_path"],
    input["path"],
    input["pattern"]
  ];
  const paths = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 2e3) continue;
    if (!isAbsolute(candidate)) {
      if (!candidate.startsWith("..")) paths.push(candidate.slice(0, 500));
      continue;
    }
    const rel = relative(absoluteRoot, resolve(candidate));
    if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) {
      paths.push(rel.slice(0, 500));
    }
  }
  return paths;
}
function outcomeStatus(raw) {
  const response = record(raw["tool_response"]);
  if (response === void 0) return "unknown";
  if (response["success"] === false || response["is_error"] === true || response["error"] !== void 0) {
    return "error";
  }
  return "ok";
}
function adaptRuntimeInput(value, options) {
  const raw = record(value);
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
  const input = record(raw["tool_input"]) ?? {};
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
  const opaque = createHash("sha256").update(`${runtime2}\0${runtimeSessionId || "unknown"}\0${resolve(root)}`).digest("hex").slice(0, 32);
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
  dirname,
  isAbsolute as isAbsolute2,
  join,
  relative as relative2,
  resolve as resolve2
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
function record2(value) {
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
  const object = record2(value);
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
  const raw = record2(value);
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
  const rel = relative2(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
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
  const absoluteRoot = resolve2(root);
  const canonicalRoot = await realpath(absoluteRoot);
  const run = join(absoluteRoot, ".void", "runs", missionId);
  let ancestor = run;
  while (!await exists(ancestor)) {
    const parent = dirname(ancestor);
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
  const logPath = join(run, "events.jsonl");
  const statePath = join(run, ".seq.state");
  const lockPath = join(run, ".seq.lock");
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
import { isAbsolute as isAbsolute3, join as join2, relative as relative3, resolve as resolve3 } from "node:path";
function code2(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function within2(root, target) {
  const rel = relative3(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute3(rel);
}
async function registerProjectRoot(root, globalDir) {
  const canonicalRoot = await realpath2(resolve3(root));
  const base = resolve3(globalDir);
  await mkdir2(base, { recursive: true, mode: 448 });
  const canonicalBase = await realpath2(base);
  const projects = join2(base, "projects");
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
  const pointer = join2(projects, `${slug}.path`);
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
var MAX_HOOK_INPUT_BYTES = 1024 * 1024;
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
    options.globalDir ?? resolve4(homedir(), ".void")
  ).catch(() => {
  });
  return event;
}
async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    bytes += chunk.byteLength;
    if (bytes > MAX_HOOK_INPUT_BYTES) {
      throw new Error("HOOK_INPUT_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function runtime(value) {
  return value === "claude" || value === "codex" ? value : "unknown";
}
function phase(value) {
  if (value === "outcome" || value === "stop") return value;
  return "activation";
}
async function main() {
  const input = await readStdin();
  let raw;
  try {
    raw = JSON.parse(input);
  } catch {
    return;
  }
  await recordRuntimeEvent({
    root: process.env["VOID_PROJECT_ROOT"] ?? process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd(),
    runtime: runtime(process.argv[3] ?? process.env["VOID_AGENT_RUNTIME"]),
    phase: phase(process.argv[2]),
    rawInput: raw,
    globalDir: process.env["VOID_GLOBAL_DIR"] ?? resolve4(homedir(), ".void"),
    ...process.env["VOID_MISSION_ID"] === void 0 ? {} : { missionId: process.env["VOID_MISSION_ID"] }
  });
}
var invokedPath = process.argv[1] === void 0 ? void 0 : resolve4(process.argv[1]);
if (invokedPath !== void 0 && resolve4(fileURLToPath(import.meta.url)) === invokedPath) {
  main().catch(() => {
    process.exitCode = 0;
  });
}
export {
  MAX_HOOK_INPUT_BYTES,
  recordRuntimeEvent
};
