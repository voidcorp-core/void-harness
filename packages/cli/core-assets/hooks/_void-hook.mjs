var GOVERNING_SKILL = {
  "boundary-direction": "void-hexagonal-architecture",
  // The remedy the refusal teaches -- build the byte rather than type it -- is a
  // fixture practice, and void-testing is the only skill that already carries it.
  "control-character": "void-testing",
  "dangerous-command": "void-security-guidance",
  "design-slop": "void-frontend-design",
  "no-any": "void-typescript-strict",
  "no-as-cast": "void-typescript-strict",
  "no-console": "void-observability",
  "no-focused-test": "void-testing",
  "no-null": "void-functional",
  "protected-file": "void-security-guidance",
  "secret-content": "void-security-guidance",
  "tdd-order": "void-tdd",
  "test-name": "void-testing"
};
var RULE_NAMES = [
  "boundary-direction",
  "control-character",
  "dangerous-command",
  "design-slop",
  "no-any",
  "no-as-cast",
  "no-console",
  "no-focused-test",
  "no-null",
  "protected-file",
  "secret-content",
  "tdd-order",
  "test-name"
];
function governingSkill(rule) {
  return GOVERNING_SKILL[rule];
}
function withGoverningSkill(rule, message) {
  return `${message} (doctrine: the ${governingSkill(rule)} skill)`;
}

import { spawnSync as spawnSync2 } from "node:child_process";
import { closeSync as closeSync2, existsSync as existsSync5, lstatSync, openSync as openSync2, readSync as readSync2, realpathSync as realpathSync2 } from "node:fs";
import { dirname as dirname3, isAbsolute as isAbsolute3, join as join5, resolve as resolve5 } from "node:path";

import { existsSync } from "node:fs";
import { join } from "node:path";
var VOID_DIR = ".void";
var VOID_MACHINE_DIR = "machine";
var VOID_PREVIOUS_MACHINE_DIR = "local";
var VOID_OWNERSHIP = Object.freeze({
  // Declared: authored or hand-edited, never regenerable from a pin. These are
  // the ONLY things at the top of `.void/`, which is what makes "everything at
  // the top is committed" a rule you can see rather than one you must look up.
  "config.json": "project",
  "PROJECT-DOCTRINE.md": "project",
  "program.md": "project",
  knowledge: "project",
  // Plans, despite the name. Measured on sesame: eight committed `.plan.md`
  // files carrying frozen model decisions that still govern its schema. Read as
  // `observed`, doctor told the project to untrack its own architecture
  // decisions — and nothing writes this directory anyway. It is a leftover of
  // the `backlog-autopilot` engine deleted at the 2026-07-30 cutover; the
  // current autopilot writes to `machine/autopilot/`. So there is no writer to
  // redirect, only a classification that was wrong.
  "autonomous-runs": "project",
  // Derived: `void-harness install` re-materializes these, byte for byte from a
  // pin. Not committed — 1.2 MB of vendored prose rewritten on every bump — but
  // their absence degrades the agent rather than breaking the project.
  "PHILOSOPHY.md": "derived",
  // Derived AND committed, which is why it stays at the top rather than moving
  // into `installed/`. `.claude/settings.json` names this path and is itself
  // committed, so ignoring the runner would give a fresh clone a settings file
  // pointing at a missing file and every tool call would fail on it. See
  // `DERIVED_LOAD_BEARING`: its absence is an error, not a degradation.
  hooks: "derived",
  // Observed: this machine's history. Never meaningful in another checkout, and
  // losing it costs nothing.
  runs: "observed",
  cache: "observed",
  outputs: "observed",
  generated: "observed",
  archives: "observed",
  autopilot: "observed",
  receipts: "observed",
  history: "observed",
  worktrees: "observed",
  // Renamed from `state.json`, which named two different things: this snapshot
  // and an autopilot run's cursor. The cursor keeps its name inside its own run
  // directory, where nothing else competes for it.
  "status.json": "observed",
  // The session checkpoint. Observed on purpose: it is what THIS machine was
  // doing, so committing it would guarantee a conflict on a file rewritten every
  // evening while serving nobody else.
  "checkpoint.md": "observed",
  // Nothing WRITES these any more — the current telemetry is `runs/*/events.jsonl`
  // — but they still exist on disk in the park (424 KB in one project), and
  // "no longer read" is not "no longer there". Dropping them from this table
  // would let them fall through to the `project` default, and doctor would start
  // telling those projects to commit their own telemetry.
  "activations.jsonl": "observed",
  "outcomes.jsonl": "observed",
  "usage.log": "observed",
  // The pre-rename name of `status.json`. Classified for the same reason: it is
  // on disk in the park, and forgetting it here would make doctor ask projects
  // to commit it. `LEGACY_RENAMES` sends it to its new name on migration.
  "state.json": "observed"
});
var LEGACY_RENAMES = Object.freeze({
  "state.json": "status.json"
});
var RETIRED_ENTRIES = Object.freeze([
  "activations.jsonl",
  "outcomes.jsonl",
  "usage.log"
]);
var MATERIALIZED_OWNERSHIP = Object.freeze({
  // The project's own wiring: hand-editable, merged rather than regenerated.
  ".claude/settings.json": "project",
  // Regenerated by `init` from the harness assets.
  ".claude/skills/": "derived",
  ".claude/agents/": "derived",
  ".claude/commands/": "derived",
  ".agents/skills/": "derived",
  ".codex/agents/": "derived",
  ".void/hooks/": "derived",
  ".void/installed/PHILOSOPHY.md": "derived",
  ".codex/hooks.json": "derived"
});
var DERIVED_LOAD_BEARING = Object.freeze([
  ".void/hooks/",
  ".codex/hooks.json"
]);
var UNIT_ROOTS = Object.freeze([
  ".claude/skills",
  ".claude/agents",
  ".claude/commands",
  ".agents/skills",
  ".codex/agents"
]);
var PREFIXED_UNIT_ROOTS = Object.freeze([
  ".claude/skills",
  ".agents/skills"
]);
var LISTED_UNIT_ROOTS = Object.freeze([
  ".claude/agents",
  ".claude/commands",
  ".codex/agents"
]);
var MACHINE_ENTRIES = Object.freeze(
  Object.keys(VOID_OWNERSHIP).filter((entry) => VOID_OWNERSHIP[entry] === "observed").sort()
);
var INSTALLED_ENTRIES = Object.freeze(
  Object.keys(VOID_OWNERSHIP).filter((entry) => VOID_OWNERSHIP[entry] === "derived").filter((entry) => !DERIVED_LOAD_BEARING.includes(`${VOID_DIR}/${entry}/`)).sort()
);
function voidDir(root) {
  return join(root, VOID_DIR);
}
function voidMachineDir(root) {
  return join(root, VOID_DIR, VOID_MACHINE_DIR);
}
function previousMachinePath(root, ...segments) {
  return join(root, VOID_DIR, VOID_PREVIOUS_MACHINE_DIR, ...segments);
}
function voidMachinePath(root, ...segments) {
  return join(voidMachineDir(root), ...segments);
}
function legacyVoidPath(root, ...segments) {
  return join(voidDir(root), ...segments);
}
function voidReadPath(root, ...segments) {
  const candidates = [
    voidMachinePath(root, ...segments),
    previousMachinePath(root, ...segments),
    legacyVoidPath(root, ...segments)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

import {
  existsSync as existsSync4,
  readFileSync as readFileSync4,
  realpathSync,
  statSync
} from "node:fs";
import {
  basename as basename2,
  dirname as dirname2,
  isAbsolute as isAbsolute2,
  join as join4,
  relative as relative2,
  resolve as resolve4
} from "node:path";

import { existsSync as existsSync2, readFileSync } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";

function allow(code2 = "ALLOW", message = "allowed") {
  return { allow: true, code: code2, message, evidence: [] };
}
function block(code2, message, evidence) {
  return { allow: false, code: code2, message, evidence };
}

function normalizedPath(path) {
  return path.replaceAll("\\", "/");
}
function isTestPath(path) {
  return /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path);
}
function isGeneratedPath(path) {
  return /\/__(?:generated|fixtures)__\//.test(path);
}
function lineEvidence(edits, applies, violates, allowTag) {
  const evidence = [];
  for (const edit of edits) {
    const path = normalizedPath(edit.path);
    if (!applies(path)) continue;
    edit.addedContent.split(/\r?\n/).forEach((line, index) => {
      if (allowTag !== void 0 && line.includes(allowTag)) return;
      if (violates(line, path)) evidence.push(`${path}:${index + 1}`);
    });
  }
  return evidence;
}
function evidenceVerdict(code2, message, evidence) {
  return evidence.length === 0 ? allow() : block(code2, message, evidence);
}

var IMPORT = /\bfrom\s+['"](@[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+)/;
function nearestManifest(projectRoot2, filePath) {
  const root = resolve(projectRoot2);
  let directory = dirname(resolve(projectRoot2, filePath));
  while (directory.startsWith(root)) {
    const candidate = join2(directory, "package.json");
    if (existsSync2(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, "utf8"));
        return {
          ...parsed.name === void 0 ? {} : { name: parsed.name },
          declared: /* @__PURE__ */ new Set([
            ...Object.keys(parsed.dependencies ?? {}),
            ...Object.keys(parsed.devDependencies ?? {}),
            ...Object.keys(parsed.peerDependencies ?? {}),
            ...Object.keys(parsed.optionalDependencies ?? {})
          ])
        };
      } catch {
        return void 0;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return void 0;
}
function boundaryDirection(edits, projectRoot2) {
  const evidence = [];
  if (projectRoot2 !== void 0) {
    const manifests = /* @__PURE__ */ new Map();
    for (const edit of edits) {
      const path = normalizedPath(edit.path);
      if (!/\.(?:ts|tsx|js|jsx)$/.test(path) || isTestPath(path) || isGeneratedPath(path)) continue;
      if (!manifests.has(path)) manifests.set(path, nearestManifest(projectRoot2, path));
      const manifest = manifests.get(path);
      if (manifest === void 0) continue;
      edit.addedContent.split(/\r?\n/).forEach((line, index) => {
        if (line.includes("allow-boundary:")) return;
        const target = line.match(IMPORT)?.[1];
        if (target === void 0 || target === manifest.name) return;
        if (manifest.declared.has(target)) return;
        evidence.push(`${path}:${index + 1} -> ${target}`);
      });
    }
  }
  return evidenceVerdict(
    "MONOREPO_UNDECLARED_DEPENDENCY",
    "imports a workspace package this one does not declare; add it to package.json dependencies",
    evidence
  );
}

var SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|mjs|json|md|yaml|sh)$/;
var ALLOWED = /* @__PURE__ */ new Set([9, 10, 13]);
function isControl(point) {
  return (point < 32 || point === 127) && !ALLOWED.has(point);
}
var MAX_EVIDENCE = 6;
function hexPoint(point) {
  return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
}
function controlCharacter(edits) {
  const evidence = [];
  for (const edit of edits) {
    const path = normalizedPath(edit.path);
    if (!SOURCE_EXTENSIONS.test(path)) continue;
    edit.addedContent.split(/\r?\n/).forEach((line, lineIndex) => {
      [...line].forEach((character, column) => {
        if (evidence.length >= MAX_EVIDENCE) return;
        const point = character.codePointAt(0) ?? 0;
        if (!isControl(point)) return;
        evidence.push(`${path}:${lineIndex + 1}:${column + 1} ${hexPoint(point)}`);
      });
    });
  }
  return evidenceVerdict(
    "CONTROL_CHARACTER_IN_SOURCE",
    "control character in a source file; it is invisible in the diff and drops the file out of the project graph. A fixture that needs the byte builds it (String.fromCharCode(0), Buffer.concat) instead of holding it literally.",
    evidence
  );
}

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

var INTER = /font-family[^;]*\bInter\b|font-\[.?Inter|fontFamily[^,]*\bInter\b/i;
var GRADIENT = /(?:from|to)-(?:purple|indigo|violet|fuchsia)-\d+[^"' ]*[^"']*(?:from|to)-(?:blue|cyan|teal|sky|indigo)-\d+|linear-gradient\([^)]*(?:purple|indigo|violet)[^)]*(?:blue|cyan|teal)/i;
var GREY_ON_COLOR = /\btext-(?:gray|grey|slate|zinc|neutral)-\d+\b[^"']*\bbg-(?:indigo|purple|blue|violet|fuchsia|emerald|rose|pink)-\d+\b/i;
var NESTED_CARD = /class(?:Name)?="[^"]*\bcard\b[^"]*"[^>]*>[^<]*<[^>]*class(?:Name)?="[^"]*\bcard\b/i;
function designSlop(edits) {
  const evidence = [];
  for (const edit of edits) {
    const path = normalizedPath(edit.path);
    if (!/\.(?:tsx|jsx|css|scss)$/.test(path) || isTestPath(path) || isGeneratedPath(path)) {
      continue;
    }
    edit.addedContent.split(/\r?\n/).forEach((line, index) => {
      if (/allow-design-slop:/.test(line)) return;
      const code2 = line.replace(/`[^`]*`|\/\*.*?\*\/|\/\/.*$/g, "");
      if (INTER.test(code2)) evidence.push(`${path}:${index + 1}: default Inter font`);
      if (GRADIENT.test(code2)) evidence.push(`${path}:${index + 1}: clich\xE9 gradient`);
      if (GREY_ON_COLOR.test(code2)) evidence.push(`${path}:${index + 1}: grey text on color`);
    });
    if (NESTED_CARD.test(edit.addedContent) && !edit.addedContent.includes("allow-design-slop:")) {
      evidence.push(`${path}: card nested directly inside card`);
    }
  }
  return evidenceVerdict(
    "GENERIC_AI_DESIGN_TELL",
    "conservative generic-design tell detected; apply the project visual language",
    evidence
  );
}

var ANY = /:\s*any\b|<any>|\bas\s+any\b/;
function noAny(edits) {
  const evidence = lineEvidence(
    edits,
    (path) => /\.(?:ts|tsx)$/.test(path) && !isTestPath(path) && !path.endsWith(".d.ts") && !isGeneratedPath(path),
    (line) => ANY.test(line),
    "allow-any:"
  );
  return evidenceVerdict(
    "TYPESCRIPT_ANY",
    "any weakens the type boundary; use a precise type or unknown plus narrowing",
    evidence
  );
}

var ASSERTION_CAST = /\bas\s+[A-Z][A-Za-z0-9_]*/;
function noAsCast(edits) {
  const evidence = lineEvidence(
    edits,
    (path) => /\.(?:ts|tsx)$/.test(path) && !isTestPath(path) && !path.endsWith(".d.ts") && !isGeneratedPath(path),
    (line) => ASSERTION_CAST.test(line),
    "allow-as-cast:"
  );
  return evidenceVerdict(
    "TYPESCRIPT_ASSERTION_CAST",
    "assertion cast detected; prefer narrowing, a type guard, a generic or boundary parsing",
    evidence
  );
}

import { existsSync as existsSync3, readFileSync as readFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
var CONFIGS = ["biome.json", "biome.jsonc"];
function normalize(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
function globMatches(pattern, path) {
  const source2 = normalize(pattern);
  const target = normalize(path);
  let regex = "";
  for (let index = 0; index < source2.length; index += 1) {
    const character = source2[index];
    if (character === "*") {
      const doubled = source2[index + 1] === "*";
      if (doubled && source2[index + 2] === "/") {
        regex += "(?:[^/]*/)*";
        index += 2;
        continue;
      }
      if (doubled) {
        regex += ".*";
        index += 1;
        continue;
      }
      regex += "[^/]*";
      continue;
    }
    if (character === "?") {
      regex += "[^/]";
      continue;
    }
    regex += character.replace(/[.*+?^${}()|[\]\\]/, (match) => `\\${match}`);
  }
  try {
    return new RegExp(`^${regex}$`).test(target);
  } catch {
    return false;
  }
}
function stripJsonc(text2) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let index = 0; index < text2.length; index += 1) {
    const character = text2[index];
    const next = text2[index + 1];
    if (inLine) {
      if (character === "\n") {
        inLine = false;
        out += character;
      }
      continue;
    }
    if (inBlock) {
      if (character === "*" && next === "/") {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      out += character;
      if (character === "\\") {
        out += next ?? "";
        index += 1;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      out += character;
      continue;
    }
    if (character === "/" && next === "/") {
      inLine = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      inBlock = true;
      index += 1;
      continue;
    }
    out += character;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
function readConfig(root) {
  for (const name of CONFIGS) {
    const path = join3(root, name);
    if (!existsSync3(path)) continue;
    try {
      return JSON.parse(stripJsonc(readFileSync2(path, "utf8")));
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function severityOf(rules, rule) {
  if (rules === void 0) return void 0;
  for (const group of Object.values(rules)) {
    const severity = group?.[rule];
    if (severity === void 0) continue;
    if (typeof severity === "string") return severity === "off" ? "off" : "on";
    if (typeof severity === "object" && severity !== null) return severity.level === "off" ? "off" : "on";
  }
  return void 0;
}
function pathList(override) {
  const raw = override.includes ?? override.include;
  return Array.isArray(raw) ? raw.filter((entry) => typeof entry === "string") : [];
}
function isRuleSuppressed(projectRoot2, rule, path) {
  const config = readConfig(projectRoot2);
  if (config === void 0) return false;
  const target = normalize(path);
  for (const override of [...config.overrides ?? []].reverse()) {
    if (!pathList(override).some((pattern) => globMatches(pattern, target))) continue;
    const severity = severityOf(override.linter?.rules, rule);
    if (severity !== void 0) return severity === "off";
  }
  return severityOf(config.linter?.rules, rule) === "off";
}

var CONSOLE = /\bconsole\.(?:log|error|warn|info|debug)\b/;
function noConsole(edits, projectRoot2) {
  const evidence = lineEvidence(
    edits,
    (path) => /\.(?:ts|tsx|js|jsx)$/.test(path) && !/(^|\/)scripts\//.test(path) && !isTestPath(path) && !isGeneratedPath(path) && !(projectRoot2 !== void 0 && isRuleSuppressed(projectRoot2, "noConsole", path)),
    (line) => CONSOLE.test(line),
    "allow-console:"
  );
  return evidenceVerdict(
    "CONSOLE_IN_SOURCE",
    "console call detected in source; use the project logger",
    evidence.map((item) => `console.* in ${item}`)
  );
}

var FOCUSED = /\b(?:it|test|describe)\.only\b|\b(?:it|test)\.skip\b|\b(?:xit|xdescribe)\b/;
function noFocusedTest(edits) {
  return evidenceVerdict(
    "FOCUSED_OR_SKIPPED_TEST",
    "focused or skipped test detected; use todo only for explicitly pending coverage",
    lineEvidence(edits, isTestPath, (line) => FOCUSED.test(line))
  );
}

function codeOnly(line) {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, "").replace(/'(?:[^'\\]|\\.)*'/g, "").replace(/`[^`]*`/g, "").replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, "");
}
function noNull(edits) {
  const evidence = lineEvidence(
    edits,
    (path) => /\.(?:ts|tsx)$/.test(path) && !isTestPath(path) && !path.endsWith(".d.ts") && !isGeneratedPath(path),
    (line, path) => {
      if (/from\s+['"]drizzle-orm|JSON\.(?:stringify|parse)|typeof.*===\s*['"]null/.test(line)) {
        return false;
      }
      const code2 = path.endsWith(".tsx") ? codeOnly(line).replace(/\breturn\s+null\b/g, "") : codeOnly(line);
      return /\bnull\b/.test(code2);
    },
    "allow-null:"
  );
  return evidenceVerdict(
    "NULL_IN_TYPESCRIPT",
    "null literal detected; prefer undefined or an explicit Option type",
    evidence
  );
}

import { readFileSync as readFileSync3 } from "node:fs";
import { basename, isAbsolute, relative, resolve as resolve2 } from "node:path";
function manifestOwnedPaths(root) {
  try {
    const parsed = JSON.parse(readFileSync3(resolve2(root, ".void/install-manifest.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === void 0 || Array.isArray(parsed)) return /* @__PURE__ */ new Set();
    const files = parsed.files;
    if (!Array.isArray(files)) return /* @__PURE__ */ new Set();
    return new Set(files.flatMap((file) => {
      if (typeof file !== "object" || file === void 0 || Array.isArray(file)) return [];
      const path = file.path;
      return typeof path === "string" && path.length > 0 ? [path.replaceAll("\\", "/")] : [];
    }));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function projectPath(root, path) {
  const absolute = resolve2(root, path);
  const relativePath = relative(resolve2(root), absolute).replaceAll("\\", "/");
  return relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath) ? void 0 : relativePath;
}
function protectedReason(path, root) {
  if (root !== void 0) {
    const relativePath = projectPath(root, path);
    if (relativePath !== void 0 && manifestOwnedPaths(root).has(relativePath)) {
      return "delivered harness asset; change the harness through void-learn";
    }
  }
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
    "bun.lock",
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
function protectedFile(paths, options = {}) {
  for (const path of paths) {
    const reason = protectedReason(path, options.root);
    if (reason !== void 0) {
      const learn = reason.includes("void-learn") ? " Use void-learn to capture the missing harness capability." : "";
      return block("PROTECTED_FILE", `refusing to edit ${path}.${learn}`, [`${path}: ${reason}`]);
    }
  }
  return allow();
}

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
  return !/\.(?:ts|tsx|js|jsx)$/.test(path) || /(^|\/)docs\//.test(path) || /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path) || /\.d\.ts$/.test(path) || /\/(?:tests?|__tests__)\/fixtures\/|\/seed\/|\/migrations\/|\/drizzle\/meta\/|\/codemods?\//.test(path) || /\/__generated__\//.test(path) || matches(path, spikeGlobs);
}
function tddApplies(path, businessGlobs, spikeGlobs) {
  return !bypass(path, spikeGlobs) && matches(path, businessGlobs);
}
var MAX_TOP_LEVEL_STATEMENTS = 512;
var DIRECTIVE = /^(['"])use [a-z][a-z ]*\1\s*;?/;
var TYPE_IMPORT = /^import\s+type\s+[^;'"]*from\s*(['"])[^'"]*\1\s*;?/;
var RE_EXPORT = /^export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s*(?:from\s*(['"])[^'"]*\1)?\s*;?/;
function endOfLiteral(source2, start) {
  const quote = source2[start] ?? "";
  for (let index = start + 1; index < source2.length; index += 1) {
    const char = source2[index] ?? "";
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === quote) return index;
  }
  return void 0;
}
function withoutComments(source2) {
  let output = "";
  let index = 0;
  while (index < source2.length) {
    const char = source2[index] ?? "";
    const next = source2[index + 1] ?? "";
    if (char === "/" && next === "/") {
      const end = source2.indexOf("\n", index);
      if (end === -1) return output;
      index = end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source2.indexOf("*/", index + 2);
      if (end === -1) return void 0;
      index = end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const end = endOfLiteral(source2, index);
      if (end === void 0) return void 0;
      output += source2.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}
function isPureReExport(source2) {
  const stripped = withoutComments(source2);
  if (stripped === void 0) return false;
  let rest = stripped.replace(/\s+/g, " ").trim();
  for (let count = 0; rest !== "" && count < MAX_TOP_LEVEL_STATEMENTS; count += 1) {
    const statement = DIRECTIVE.exec(rest) ?? TYPE_IMPORT.exec(rest) ?? RE_EXPORT.exec(rest) ?? void 0;
    if (statement === void 0) return false;
    rest = rest.slice(statement[0].length).trim();
  }
  return rest === "";
}
function carriesNoBehaviour(original, proposed) {
  return isPureReExport(original) && isPureReExport(proposed);
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
  const declared = [];
  for (const edit of input.edits) {
    if (edit.operation === "delete" && edit.addedContent === "") continue;
    const path = edit.path.replaceAll("\\", "/");
    if (!tddApplies(path, input.businessGlobs, input.spikeGlobs)) continue;
    const original = input.originalSources[path];
    const proposed = input.proposedSources[path];
    if (original !== void 0 && proposed !== void 0 && carriesNoBehaviour(original, proposed)) continue;
    const declaredTest2 = input.declaredTests?.[path];
    if (declaredTest2 !== void 0) {
      declared.push(`${path} -> ${declaredTest2}`);
      continue;
    }
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
      "missing sibling test: add one or declare // tdd-cover: e2e <project-relative spec> on the first line",
      [evidence]
    );
  }
  if (warnings.length === 0 && declared.length > 0) return {
    allow: true,
    code: "TDD_DECLARED_TEST",
    message: "declared test file exists; suite not executed",
    evidence: declared
  };
  return warnings.length === 0 ? allow() : {
    allow: true,
    code: "TDD_SIBLING_TEST_WARNING",
    message: "warning: souple mode, sibling test missing",
    evidence: warnings
  };
}

var GENERIC_NAME = /\b(?:it|test)\(\s*['"]should\s|\b(?:it|test)\(\s*['"]works?\b|\b(?:it|test)\(\s*['"]test['"]/;
function testName(edits) {
  return evidenceVerdict(
    "GENERIC_TEST_NAME",
    "generic test name must describe observable behavior",
    lineEvidence(edits, isTestPath, (line) => GENERIC_NAME.test(line))
  );
}

var REDIRECTION = /(?:^|\s)(?:\d*|&)>{1,2}\s*("[^"]*"|'[^']*'|[^\s;|&<>]+)/g;
var TEE = /(?:^|[\s|])tee\s+(?:-a\s+)?("[^"]*"|'[^']*'|[^\s;|&<>-][^\s;|&<>]*)/g;
function unquote2(target) {
  const quoted = /^(["'])(.*)\1$/.exec(target);
  return quoted?.[2] ?? target;
}
function shellWriteTargets(command) {
  const targets = /* @__PURE__ */ new Set();
  for (const pattern of [REDIRECTION, TEE]) {
    for (const match of command.matchAll(pattern)) {
      const target = match[1];
      if (target === void 0) continue;
      const path = unquote2(target);
      if (path !== "") targets.add(path);
    }
  }
  return [...targets].sort();
}

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
  let deleting = false;
  const emit = () => {
    if (path !== "") edits.push({
      path,
      addedContent: added,
      ...deleting ? { operation: "delete" } : {}
    });
  };
  for (const line of patch.split(/\r?\n/)) {
    const section = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (section !== null) {
      emit();
      path = safeString(section[2] ?? "", "patch path");
      added = "";
      deleting = section[1] === "Delete";
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
  const file = safeString(input["file_path"] ?? input["path"], "file_path");
  let edits;
  if (file !== "") {
    edits = [{
      path: file,
      addedContent: safeString(input["content"] ?? input["new_string"], "edit content")
    }];
  } else {
    edits = parsePatchEdits(patchText(input));
  }
  const shellTargets = shellWriteTargets(command).filter((path) => !edits.some((edit) => edit.path === path)).map((path) => ({ path, addedContent: "" }));
  return { tool, command, edits: [...edits, ...shellTargets] };
}

import { resolve as resolve3 } from "node:path";
var MAX_SOURCE_BYTES = 65536;
var unresolved = (reason) => ({ kind: "unresolved", reason });
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function source(content) {
  return Buffer.byteLength(content) <= MAX_SOURCE_BYTES ? { kind: "source", content } : unresolved("proposed file exceeds 64 KiB");
}
function replace(existing, input) {
  const before = input["old_string"];
  const after = input["new_string"];
  if (existing === void 0 || typeof before !== "string" || before === "" || typeof after !== "string") {
    return unresolved("Edit requires an existing file and a nonempty old_string");
  }
  const first = existing.indexOf(before);
  if (first < 0) return unresolved("old_string no longer matches the file");
  if (input["replace_all"] === true) {
    let count = 0;
    for (let index = first; index >= 0; index = existing.indexOf(before, index + before.length)) count += 1;
    const length = existing.length + count * (after.length - before.length);
    if (length > MAX_SOURCE_BYTES) return unresolved("replacement exceeds the 64 KiB source limit");
    return source(existing.split(before).join(after));
  }
  if (existing.indexOf(before, first + 1) >= 0) return unresolved("old_string matches more than once");
  return source(existing.slice(0, first) + after + existing.slice(first + before.length));
}
function update(existing, patch) {
  let lines = existing.replaceAll("\r\n", "\n").split("\n");
  let cursor = 0;
  let index = 0;
  let hunks = 0;
  let comparisons = 0;
  while (index < patch.length) {
    if (++hunks > 128 || !patch[index]?.startsWith("@@")) return unresolved("unsupported patch hunk");
    index += 1;
    const before = [];
    const after = [];
    while (index < patch.length && !patch[index]?.startsWith("@@")) {
      const line = patch[index++] ?? "";
      if (line === "*** End of File") {
        if (index !== patch.length) return unresolved("misplaced end-of-file marker");
        break;
      }
      if (![" ", "+", "-"].includes(line[0] ?? "")) return unresolved("unsupported patch line");
      if (!line.startsWith("+")) before.push(line.slice(1));
      if (!line.startsWith("-")) after.push(line.slice(1));
    }
    if (before.length === 0) return unresolved("patch insertion has no exact context");
    const matches2 = [];
    for (let start2 = cursor; start2 + before.length <= lines.length; start2 += 1) {
      comparisons += before.length;
      if (comparisons > 1e6) return unresolved("patch matching exceeds its comparison limit");
      if (before.every((line, offset) => lines[start2 + offset] === line)) matches2.push(start2);
      if (matches2.length > 1) break;
    }
    const start = matches2[0];
    if (matches2.length !== 1 || start === void 0) return unresolved("patch context is stale or ambiguous");
    lines = [...lines.slice(0, start), ...after, ...lines.slice(start + before.length)];
    cursor = start + after.length;
    if (Buffer.byteLength(lines.join("\n")) > MAX_SOURCE_BYTES) return unresolved("proposed file exceeds 64 KiB");
  }
  return source(lines.join("\n"));
}
function fromPatch(patch, root, target, existing) {
  if (Buffer.byteLength(patch) > 1024 * 1024) return unresolved("patch exceeds input limit");
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "*** Begin Patch" || !patch.trimEnd().endsWith("*** End Patch")) {
    return unresolved("patch requires complete begin and end markers");
  }
  const sections = [];
  let active;
  for (const line of lines) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header !== null) {
      active = resolve3(root, header[2] ?? "") === target ? { kind: header[1] ?? "", lines: [] } : void 0;
      if (active !== void 0) sections.push(active);
    } else if (line === "*** End Patch") {
      active = void 0;
    } else if (active !== void 0) active.lines.push(line);
  }
  const section = sections[0];
  if (sections.length !== 1 || section === void 0) return unresolved("patch must name the file exactly once");
  if (section.kind === "Add") {
    if (existing !== void 0 || section.lines.some((line) => !line.startsWith("+"))) {
      return unresolved("Add File requires a new file and literal added lines");
    }
    return source(`${section.lines.map((line) => line.slice(1)).join("\n")}
`);
  }
  if (section.kind !== "Update" || existing === void 0) return unresolved("patch requires an existing file");
  return update(existing, section.lines);
}
function proposedSource(raw, root, path, existing) {
  const call = object(raw);
  const input = object(call["tool_input"]);
  if (call["tool_name"] === "Write" && typeof input["content"] === "string") return source(input["content"]);
  if (call["tool_name"] === "Edit") return replace(existing, input);
  for (const key of ["patch", "input", "content", "command"]) {
    const value = input[key];
    if (typeof value === "string" && value.includes("*** Begin Patch")) {
      return fromPatch(value, root, resolve3(root, path), existing);
    }
  }
  return unresolved("tool input does not describe a reconstructable file");
}

import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
function readOriginalSource(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = fstatSync(descriptor);
    if (!before.isFile()) return { kind: "unavailable" };
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(descriptor, buffer, size, buffer.length - size, size);
      if (count === 0) break;
      size += count;
    }
    const after = fstatSync(descriptor);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || size !== Math.min(before.size, buffer.length)) return { kind: "unavailable" };
    return {
      kind: "read",
      header: buffer.subarray(0, Math.min(size, 8192)).toString("utf8"),
      source: size <= MAX_SOURCE_BYTES ? buffer.subarray(0, size).toString("utf8") : void 0
    };
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? { kind: "absent" } : { kind: "unavailable" };
  } finally {
    if (descriptor !== void 0) closeSync(descriptor);
  }
}

import { spawnSync } from "node:child_process";

var SYNTAX_PARSER_GZIP = "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";

function syntaxWorker() {
  const { readFileSync: readFileSync11 } = process.getBuiltinModule("node:fs");
  const { gunzipSync } = process.getBuiltinModule("node:zlib");
  let reason = "bundled syntax parser is unavailable";
  try {
    const { parser, ...input } = JSON.parse(readFileSync11(0, "utf8"));
    const program = gunzipSync(Buffer.from(parser, "base64"), { maxOutputLength: 8 * 1024 * 1024 }).toString("utf8");
    const analyze = new Function("require", `${program}; return harnessSyntaxParser.analyzeSyntax;`)(process.getBuiltinModule);
    reason = "source could not be parsed within the supported limits";
    process.stdout.write(JSON.stringify(analyze(input)));
  } catch {
    process.stdout.write(JSON.stringify({ unavailable: reason }));
  }
}
function unavailableSyntax(reason, path, correction = "provide valid complete source within the limits; if the bundled parser is unavailable, repair the harness installation, then retry") {
  return {
    allow: false,
    code: "TEST_SYNTAX_UNVERIFIED",
    message: `source syntax verification unavailable: ${reason}; ${correction}`,
    evidence: [path]
  };
}
function inspectSourceSyntax(root, path, source2, remainingMs = 1e3, purpose = "focused-tests") {
  if (Buffer.byteLength(source2) > MAX_SOURCE_BYTES) return unavailableSyntax("file exceeds 64 KiB", path);
  if (remainingMs < 1) return unavailableSyntax("operation exhausted its one-second parsing budget", path, "split the operation into smaller edits");
  const child = spawnSync(process.execPath, ["--max-old-space-size=128", "--eval", `(${syntaxWorker.toString()})()`], {
    cwd: root,
    env: {},
    encoding: "utf8",
    timeout: Math.min(1e3, Math.ceil(remainingMs)),
    killSignal: "SIGKILL",
    maxBuffer: 65536,
    input: JSON.stringify({ parser: SYNTAX_PARSER_GZIP, path, source: source2, purpose }),
    windowsHide: true
  });
  if (child.error !== void 0 || child.status !== 0) return unavailableSyntax("parser process failed or exceeded its resource limit", path);
  try {
    return syntaxVerdict(JSON.parse(child.stdout), path, purpose);
  } catch {
    return unavailableSyntax("parser returned an invalid result", path);
  }
}
function syntaxVerdict(result, path, purpose) {
  try {
    if (typeof result !== "object" || result === null) throw new Error();
    const record8 = result;
    if (typeof record8["unavailable"] === "string") {
      const permitted = [
        "bundled syntax parser is unavailable",
        "source could not be parsed within the supported limits"
      ];
      return unavailableSyntax(permitted.includes(record8["unavailable"]) ? record8["unavailable"] : "parser returned an invalid result", path);
    }
    const lines = record8["lines"];
    if (!Array.isArray(lines) || lines.length > 2e4 || !lines.every((line) => Number.isSafeInteger(line) && line > 0)) throw new Error();
    if (purpose === "declarations") return lines.length === 0 || lines.length === 1 && lines[0] === 1 ? {
      allow: true,
      code: lines.length === 0 ? "TDD_DECLARATION_NONE" : "TDD_DECLARATION_HEADER",
      message: "declaration comment syntax checked",
      evidence: []
    } : {
      allow: false,
      code: "TDD_DECLARATION_INVALID",
      message: "put exactly one E2E declaration comment on the first line",
      evidence: [path]
    };
    return lines.length === 0 ? { allow: true, code: "OK", message: "focused-test syntax checked", evidence: [] } : {
      allow: false,
      code: "FOCUSED_OR_SKIPPED_TEST",
      message: "focused or skipped test detected; use todo only for explicitly pending coverage",
      evidence: lines.map((line) => `${path}:${line}`)
    };
  } catch {
    return unavailableSyntax("parser returned an invalid result", path);
  }
}

var MAX_HOOK_INPUT_BYTES = 1024 * 1024;
var BINARY_INPUT_MESSAGE = "HOOK_INPUT_BINARY: a NUL byte in the tool payload. A source file holding one is dropped from the project graph, and no diff shows it. A fixture that needs the byte builds it (String.fromCharCode(0), Buffer.concat) instead of holding it literally.";
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
  if (text2.includes("\0")) throw new Error(BINARY_INPUT_MESSAGE);
  return text2;
}
function parseHookPayload(input) {
  const text2 = parseHookText(input);
  const parsed = JSON.parse(text2);
  if (containsNul(parsed)) throw new Error(BINARY_INPUT_MESSAGE);
  return parsed;
}
function physicalPath(path) {
  const absolute = resolve4(path);
  let existing = absolute;
  const suffix = [];
  while (true) {
    try {
      return join4(realpathSync(existing), ...suffix);
    } catch {
      const parent = dirname2(existing);
      if (parent === existing) return absolute;
      suffix.unshift(basename2(existing));
      existing = parent;
    }
  }
}
function discoverProjectRoot(start) {
  let current = physicalPath(start);
  while (true) {
    if (existsSync4(join4(current, ".void", "config.json")) || existsSync4(join4(current, ".git"))) {
      return current;
    }
    const parent = dirname2(current);
    if (parent === current) return physicalPath(start);
    current = parent;
  }
}
function projectRelativePath(root, path) {
  const physicalRoot = physicalPath(root);
  const absolute = physicalPath(isAbsolute2(path) ? path : resolve4(physicalRoot, path));
  const projectPath2 = relative2(physicalRoot, absolute).replaceAll("\\", "/");
  return projectPath2 === ".." || projectPath2.startsWith("../") || isAbsolute2(projectPath2) ? void 0 : projectPath2;
}
function projectEdits(root, edits) {
  return edits.flatMap((edit) => {
    const path = projectRelativePath(root, edit.path);
    return path === void 0 ? [] : [{ ...edit, path, originalPath: edit.path }];
  });
}
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function configuredString(parent, key, fallback) {
  const value = parent?.[key];
  return typeof value === "string" ? value : fallback;
}
function configuredStrings(parent, key, fallback) {
  const value = parent?.[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    const kept = value.filter((entry) => typeof entry === "string");
    if (kept.length > 0) return kept;
  }
  return [fallback];
}
function readTddConfig(root) {
  let config = {};
  try {
    config = record2(JSON.parse(readFileSync4(join4(root, ".void/config.json"), "utf8"))) ?? {};
  } catch {
  }
  const modes = record2(config["modes"]);
  const paths = record2(config["paths"]);
  const configuredMode = configuredString(modes, "tdd", "auto");
  const mode = configuredMode === "strict" || configuredMode === "souple" || configuredMode === "exploratory" ? configuredMode : "auto";
  return {
    mode,
    businessGlobs: configuredStrings(paths, "business", "apps/*/src/**"),
    spikesGlob: configuredString(paths, "spikes", "apps/*/scripts/spike-*")
  };
}
function focusedVerdict(root, edits, raw, syntaxInspector) {
  const deadline = performance.now() + 1e3;
  const governed = projectEdits(root, edits).filter((edit) => isTestPath(edit.path) && edit.operation !== "delete");
  const limit = () => unavailableSyntax(
    "operation exceeds its file or one-second work budget",
    "",
    "split the operation into smaller edits"
  );
  if (governed.length > 32) return limit();
  if (new Set(governed.map((edit) => edit.path)).size !== governed.length) {
    return unavailableSyntax("patch must name each physical file exactly once", "", "combine edits to the same file");
  }
  for (const edit of governed) {
    if (performance.now() >= deadline) return limit();
    const original = readOriginalSource(join4(root, edit.path));
    const proposed = proposedSource(raw, root, edit.originalPath, original.kind === "read" ? original.source : void 0);
    if (performance.now() >= deadline) return limit();
    if (proposed.kind === "unresolved") return unavailableSyntax(
      proposed.reason,
      edit.path,
      "provide an exact supported Edit/patch or a complete Write within 64 KiB"
    );
    if (!/\b(?:only|skip|xit|xdescribe)\b|\\u/.test(proposed.content)) continue;
    if (/^[ \t]*(?:(?:it|test|describe)\.only|(?:it|test)\.skip|xit|xdescribe)[ \t]*\(/.test(proposed.content)) {
      return noFocusedTest([{ path: edit.path, addedContent: proposed.content.split("\n")[0] ?? "" }]);
    }
    const verdict = syntaxInspector(root, edit.path, proposed.content, deadline - performance.now());
    if (performance.now() >= deadline) return limit();
    if (!verdict.allow) return verdict;
  }
  return governed.length > 0 && performance.now() >= deadline ? limit() : allow();
}
function declaredTest(root, content) {
  const lines = content.split(/\r?\n/);
  if (!/^\s*\/\/\s*tdd-cover:/.test(lines[0] ?? "")) return void 0;
  const match = /^\/\/ tdd-cover: e2e (.+)$/.exec(lines[0] ?? "");
  const path = match?.[1];
  if (path === void 0 || path !== path.trim() || isAbsolute2(path) || /^[A-Za-z]:|\\/.test(path) || path.split("/").some((part) => part === ".." || part === ".") || !isTestPath(path)) throw new Error("declare exactly one project-relative E2E spec on the first line");
  const target = realpathSync(join4(root, path));
  const location = relative2(root, target);
  if (location.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || location === ".." || isAbsolute2(location) || !statSync(target).isFile()) {
    throw new Error("E2E spec must be a regular file inside the physical project root");
  }
  return path;
}
function tddOperationLimit(reason) {
  return {
    allow: false,
    code: "TDD_DECLARATION_UNVERIFIED",
    message: `cannot verify TDD evidence: ${reason}; split the operation into smaller edits`,
    evidence: []
  };
}
function tddVerdict(root, edits, raw, checkedOut, syntaxInspector) {
  const physicalRoot = physicalPath(root);
  const projectChanges = projectEdits(physicalRoot, edits);
  const config = readTddConfig(physicalRoot);
  const existingHeaders = {};
  const originalSources = {};
  const siblingTests = /* @__PURE__ */ new Set();
  const declaredTests = {};
  const proposedSources = {};
  const deadline = performance.now() + 1e3;
  const governed = projectChanges.filter((edit) => !(edit.operation === "delete" && edit.addedContent === "") && tddApplies(edit.path, config.businessGlobs, [config.spikesGlob]));
  if (governed.length > 32) return tddOperationLimit("operation exceeds 32 governed production files");
  if (new Set(governed.map((edit) => edit.path)).size !== governed.length) {
    return tddOperationLimit("patch must name each physical file exactly once");
  }
  for (const edit of governed) {
    if (performance.now() >= deadline) return tddOperationLimit("operation exhausted its one-second work budget");
    const original = readOriginalSource(join4(physicalRoot, edit.path));
    if (original.kind === "unavailable") return {
      allow: false,
      code: "TDD_DECLARATION_UNVERIFIED",
      message: "cannot read original TDD mode; restore readable regular source before editing",
      evidence: [edit.path]
    };
    const existing = original.kind === "read" ? original.source : void 0;
    const proposed = checkedOut ? existing === void 0 ? { kind: "unresolved", reason: "checked-out source is absent or exceeds 64 KiB" } : { kind: "source", content: existing } : proposedSource(raw, physicalRoot, edit.originalPath, existing);
    if (performance.now() >= deadline) return tddOperationLimit("operation exhausted its one-second work budget");
    if (proposed.kind === "unresolved") return {
      allow: false,
      code: "TDD_DECLARATION_UNVERIFIED",
      message: `cannot verify E2E declaration: ${proposed.reason}; provide exact context, or a complete Write within 64 KiB (oversized originals require replacement or restructuring)`,
      evidence: [edit.path]
    };
    const [header = "", ...body] = proposed.content.split(/\r?\n/);
    const startsWithDeclaration = /^\/\/\s*tdd-cover:/.test(header);
    if (body.some((line) => line.includes("tdd-cover:")) || header.includes("tdd-cover:") && !startsWithDeclaration) {
      const syntax = syntaxInspector(
        physicalRoot,
        edit.path,
        proposed.content,
        deadline - performance.now(),
        "declarations"
      );
      if (performance.now() >= deadline) return tddOperationLimit("operation exhausted its one-second work budget");
      if (syntax.code === "TDD_DECLARATION_HEADER" && !startsWithDeclaration) {
        return {
          allow: false,
          code: "TDD_DECLARATION_INVALID",
          message: "put the E2E declaration on its own first line before code",
          evidence: [edit.path]
        };
      }
      if (!syntax.allow) return { ...syntax, code: syntax.code === "TDD_DECLARATION_INVALID" ? syntax.code : "TDD_DECLARATION_UNVERIFIED" };
    }
    try {
      proposedSources[edit.path] = proposed.content;
      const test = declaredTest(physicalRoot, proposed.content);
      if (test !== void 0) declaredTests[edit.path] = test;
      existingHeaders[edit.path] = original.kind === "read" ? original.header : "";
      originalSources[edit.path] = original.kind === "read" ? original.source : "";
    } catch {
      return {
        allow: false,
        code: "TDD_DECLARATION_INVALID",
        message: "put one // tdd-cover: e2e <project-relative spec> on the first line, pointing to an existing regular test file inside the project",
        evidence: [edit.path]
      };
    }
    for (const sibling of [
      edit.path.replace(/\.tsx$/, ".test.tsx"),
      edit.path.replace(/\.ts$/, ".test.ts"),
      edit.path.replace(/\.jsx$/, ".test.jsx"),
      edit.path.replace(/\.js$/, ".test.js")
    ]) {
      if (sibling !== edit.path && existsSync4(join4(physicalRoot, sibling))) {
        siblingTests.add(sibling);
      }
    }
  }
  const verdict = tddOrder({
    edits: projectChanges,
    mode: config.mode,
    businessGlobs: config.businessGlobs,
    spikeGlobs: [config.spikesGlob],
    existingHeaders,
    originalSources,
    siblingTests,
    declaredTests,
    proposedSources
  });
  return governed.length > 0 && performance.now() >= deadline ? tddOperationLimit("operation exhausted its one-second work budget") : verdict;
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
    const ownership = options.source === "checked-out" ? {} : { root: options.root };
    return protectedFile(call.edits.map((edit) => edit.path), ownership);
  }
  if (rule === "secret-content") return secretContent(call.edits);
  if (rule === "control-character") return controlCharacter(call.edits);
  if (rule === "tdd-order") return tddVerdict(
    options.root,
    call.edits,
    rawInput,
    options.source === "checked-out",
    options.syntaxInspector ?? inspectSourceSyntax
  );
  if (rule === "no-focused-test") return focusedVerdict(
    options.root,
    call.edits,
    rawInput,
    options.syntaxInspector ?? inspectSourceSyntax
  );
  const edits = projectEdits(options.root, call.edits);
  if (rule === "no-any") return noAny(edits);
  if (rule === "no-as-cast") return noAsCast(edits);
  if (rule === "no-console") return noConsole(edits, options.root);
  if (rule === "no-null") return noNull(edits);
  if (rule === "boundary-direction") return boundaryDirection(edits, options.root);
  if (rule === "test-name") return testName(edits);
  if (rule === "design-slop") return designSlop(edits);
  rule;
  throw new Error("UNKNOWN_ENFORCEMENT_RULE");
}

var GIT_TIMEOUT_MS = 5e3;
var GIT_MAX_OUTPUT_BYTES = 1e6;
function canonical(path) {
  try {
    return realpathSync2(resolve5(path));
  } catch {
    return resolve5(path);
  }
}
function git(cwd, args, deadline) {
  const remaining = deadline === void 0 ? GIT_TIMEOUT_MS : Math.ceil(deadline - performance.now());
  if (remaining <= 0) return void 0;
  const result = spawnSync2("git", args, {
    cwd,
    ...deadline === void 0 ? {} : {
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_(DIR|WORK_TREE|COMMON_DIR|CONFIG|INDEX_FILE)/.test(name)))
    },
    encoding: "utf8",
    timeout: Math.min(GIT_TIMEOUT_MS, remaining),
    maxBuffer: GIT_MAX_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return void 0;
  return result.stdout;
}
function mainWorkingTree(cwd, deadline, expectedCommon, query = git) {
  const listing = query(cwd, ["worktree", "list", "--porcelain"], deadline);
  if (listing === void 0) return void 0;
  const [first = ""] = listing.split(/\r?\n\r?\n/);
  const attributes = first.split(/\r?\n/);
  const [head = ""] = attributes;
  if (!head.startsWith("worktree ")) return void 0;
  if (attributes.includes("bare")) return void 0;
  const listed = head.slice("worktree ".length);
  const args = ["rev-parse", "--show-toplevel", ...expectedCommon === void 0 ? [] : ["--git-common-dir"]];
  const [toplevel, common] = query(listed, args, deadline)?.trim().split(/\r?\n/) ?? [];
  if (toplevel === void 0 || toplevel === "") return void 0;
  if (expectedCommon !== void 0 && (common === void 0 || canonical(resolve5(listed, common)) !== expectedCommon)) return void 0;
  return canonical(toplevel);
}
function holdsInstallReceipt(root) {
  return existsSync5(voidReadPath(root, "receipts", "install-v1.json"));
}
function gitPointer(path) {
  if (!lstatSync(path).isFile()) throw new Error("INVALID_GIT_POINTER");
  const file = openSync2(path, "r");
  try {
    const bytes = Buffer.alloc(4097);
    const size = readSync2(file, bytes, 0, bytes.length, 0);
    if (size > 4096) throw new Error("INVALID_GIT_POINTER");
    const content = bytes.subarray(0, size);
    const value = content.toString("utf8").replace(/\r?\n$/, "");
    if (content.includes(0) || value === "" || /[\r\n]/.test(value)) {
      throw new Error("INVALID_GIT_POINTER");
    }
    return value;
  } finally {
    closeSync2(file);
  }
}
function ordinaryLinkedMain(tree) {
  const marker = join5(tree, ".git");
  const pointer = gitPointer(marker);
  if (!pointer.startsWith("gitdir: ")) throw new Error("INVALID_GIT_POINTER");
  const directory = canonical(resolve5(tree, pointer.slice(8)));
  if (!existsSync5(join5(directory, "commondir"))) return void 0;
  const common = canonical(resolve5(directory, gitPointer(join5(directory, "commondir"))));
  const backlink = gitPointer(join5(directory, "gitdir"));
  if (!isAbsolute3(backlink) || canonical(backlink) !== canonical(marker) || canonical(dirname3(directory)) !== canonical(join5(common, "worktrees"))) {
    throw new Error("INVALID_GIT_POINTER");
  }
  const candidate = dirname3(common);
  const candidateMarker = join5(candidate, ".git");
  if (!lstatSync(candidateMarker, { throwIfNoEntry: false })?.isDirectory() || canonical(candidateMarker) !== common) return void 0;
  return candidate;
}
function resolveTelemetryRoot(cwd, query = git) {
  const refused = { kind: "unavailable", code: "TELEMETRY_ROOT_UNRESOLVED" };
  try {
    let tree = canonical(cwd);
    while (lstatSync(join5(tree, ".git"), { throwIfNoEntry: false }) === void 0 && !holdsInstallReceipt(tree)) {
      const parent = dirname3(tree);
      if (parent === tree) {
        return { kind: "resolved", root: canonical(discoverProjectRoot(cwd)) };
      }
      tree = parent;
    }
    const marker = join5(tree, ".git");
    const markerStat = lstatSync(marker, { throwIfNoEntry: false });
    if (markerStat?.isSymbolicLink()) return refused;
    if (markerStat === void 0 || markerStat.isDirectory() || holdsInstallReceipt(tree)) {
      return { kind: "resolved", root: tree };
    }
    const ordinary = ordinaryLinkedMain(tree);
    if (ordinary !== void 0) return { kind: "resolved", root: ordinary };
    const deadline = performance.now() + 100;
    const [toplevel, directory, common] = query(tree, [
      "rev-parse",
      "--show-toplevel",
      "--absolute-git-dir",
      "--git-common-dir"
    ], deadline)?.trim().split(/\r?\n/) ?? [];
    if (toplevel === void 0 || canonical(toplevel) !== tree) return refused;
    if (directory === void 0 || common === void 0) return refused;
    const commonDirectory = canonical(resolve5(tree, common));
    if (canonical(directory) === commonDirectory) return { kind: "resolved", root: tree };
    const main2 = mainWorkingTree(tree, deadline, commonDirectory, query);
    if (main2 === void 0) return refused;
    return { kind: "resolved", root: main2 };
  } catch {
    return refused;
  }
}

import { mkdirSync, readFileSync as readFileSync5, renameSync, writeFileSync } from "node:fs";
import { dirname as dirname4, join as join6 } from "node:path";
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function cacheFilePath(env) {
  const xdg = env["XDG_CACHE_HOME"]?.trim();
  const home = env["HOME"]?.trim();
  const base = xdg !== void 0 && xdg !== "" ? xdg : home !== void 0 && home !== "" ? join6(home, ".cache") : void 0;
  return base === void 0 ? void 0 : join6(base, "void-harness", "freshness.json");
}
function parseEntry(raw) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!isRecord(json)) return void 0;
  const { latest, checkedAt } = json;
  if (typeof latest !== "string" || latest.trim() === "") return void 0;
  if (typeof checkedAt !== "number" || !Number.isFinite(checkedAt)) return void 0;
  return { latest, checkedAt };
}
function readFreshnessCache(env, now) {
  const path = cacheFilePath(env);
  if (path === void 0) return void 0;
  let raw;
  try {
    raw = readFileSync5(path, "utf8");
  } catch {
    return void 0;
  }
  const entry = parseEntry(raw);
  if (entry === void 0) return void 0;
  const age = now - entry.checkedAt;
  return age >= 0 && age <= CACHE_TTL_MS ? entry : void 0;
}
async function writeFreshnessCache(env, entry) {
  const path = cacheFilePath(env);
  if (path === void 0) return void 0;
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname4(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify({ latest: entry.latest, checkedAt: entry.checkedAt }), "utf8");
    renameSync(tmp, path);
  } catch {
  }
  return void 0;
}

var SEMVER_TRIPLE = /^(\d{1,10})\.(\d{1,10})\.(\d{1,10})$/;
function clean(raw) {
  return raw.trim().replace(/^v/, "");
}
function triple(raw) {
  const match = SEMVER_TRIPLE.exec(clean(raw)) ?? void 0;
  if (match === void 0) return void 0;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  return parts.every(Number.isSafeInteger) ? parts : void 0;
}
function unusable(raw) {
  const value = clean(raw);
  if (value === "") return "is empty";
  if (value === "unknown") return "is unknown";
  if (value.includes("-") || value.includes("+")) {
    return "is a prerelease or carries build metadata, which is not comparable";
  }
  return "is not a M.m.p version";
}
function compareFreshness(installed, latest) {
  const local = triple(installed);
  if (local === void 0) {
    return {
      verdict: "unknown",
      installed,
      latest,
      reason: `installed version ${unusable(installed)}`
    };
  }
  const remote = triple(latest);
  if (remote === void 0) {
    return {
      verdict: "unknown",
      installed,
      latest,
      reason: `published version ${unusable(latest)}`
    };
  }
  for (let i = 0; i < 3; i += 1) {
    const mine = local[i] ?? 0;
    const theirs = remote[i] ?? 0;
    if (mine !== theirs) {
      return { verdict: mine < theirs ? "behind" : "ahead", installed, latest };
    }
  }
  return { verdict: "up-to-date", installed, latest };
}

var DEFAULT_REGISTRY = "https://registry.npmjs.org";
var NPM_PACKAGE = "voidharness";
var DEFAULT_TIMEOUT_MS = 1500;
var isRecord2 = (v) => typeof v === "object" && v !== void 0 && v !== null && !Array.isArray(v);
function safeRegistry(candidate) {
  if (candidate === void 0 || candidate.trim() === "") return void 0;
  let url;
  try {
    url = new URL(candidate.trim());
  } catch {
    return void 0;
  }
  if (url.protocol !== "https:") return void 0;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
function registryFromNpmrc(npmrc) {
  if (npmrc === void 0) return void 0;
  for (const rawLine of npmrc.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue;
    const match = /^registry\s*=\s*(.+)$/i.exec(line) ?? void 0;
    if (match !== void 0) return match[1]?.trim();
  }
  return void 0;
}
function resolveRegistry(env, npmrc) {
  const fromEnv = safeRegistry(env["npm_config_registry"] ?? env["NPM_CONFIG_REGISTRY"]);
  if (fromEnv !== void 0) return fromEnv;
  return safeRegistry(registryFromNpmrc(npmrc)) ?? DEFAULT_REGISTRY;
}
function distTagsUrl(registry, pkg) {
  const name = pkg.trim();
  if (name === "" || name.includes("..") || name.startsWith("/")) {
    throw new Error(`unsafe package name: ${JSON.stringify(pkg)}`);
  }
  return `${registry}/-/package/${encodeURIComponent(name)}/dist-tags`;
}
function parseLatestTag(json) {
  if (!isRecord2(json)) return void 0;
  const latest = json["latest"];
  return typeof latest === "string" && latest.trim() !== "" ? latest.trim() : void 0;
}
async function fetchLatestVersion(options = {}) {
  const {
    fetchImpl = fetch,
    registry = DEFAULT_REGISTRY,
    pkg = NPM_PACKAGE,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = options;
  let url;
  try {
    url = distTagsUrl(registry, pkg);
  } catch {
    return { reason: "unsafe package name" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": "void-harness" },
      signal: controller.signal
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) return { reason: `HTTP ${res.status} (rate-limited)` };
      return { reason: `HTTP ${res.status}` };
    }
    let json;
    try {
      json = await res.json();
    } catch {
      return { reason: "malformed response" };
    }
    const latest = parseLatestTag(json);
    return latest === void 0 ? { reason: "no usable latest tag in response" } : { latest };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { reason: name === "AbortError" ? "timed out" : "network error" };
  } finally {
    clearTimeout(timer);
  }
}

import { readFileSync as readFileSync6, statSync as statSync2 } from "node:fs";
import { join as join7 } from "node:path";
var MAX_NPMRC_BYTES = 64 * 1024;
function readIfSmall(path) {
  try {
    if (statSync2(path).size > MAX_NPMRC_BYTES) return void 0;
    return readFileSync6(path, "utf8");
  } catch {
    return void 0;
  }
}
function readNpmrc(cwd, env) {
  const project = readIfSmall(join7(cwd, ".npmrc"));
  if (project !== void 0) return project;
  const home = env["HOME"]?.trim();
  return home === void 0 || home === "" ? void 0 : readIfSmall(join7(home, ".npmrc"));
}

async function resolveFreshness(options) {
  const { installed, env, now, fetchImpl, npmrc, cwd, allowNetwork = true, timeoutMs } = options;
  const cached = readFreshnessCache(env, now);
  if (cached !== void 0) return compareFreshness(installed, cached.latest);
  if (!allowNetwork) {
    return { verdict: "unknown", installed, reason: "no fresh cached version and network lookups are disabled" };
  }
  const resolvedNpmrc = npmrc ?? readNpmrc(cwd ?? process.cwd(), env);
  const { latest, reason } = await fetchLatestVersion({
    registry: resolveRegistry(env, resolvedNpmrc),
    ...fetchImpl === void 0 ? {} : { fetchImpl },
    ...timeoutMs === void 0 ? {} : { timeoutMs }
  });
  if (latest === void 0) {
    return { verdict: "unknown", installed, reason: reason ?? "could not read the published version" };
  }
  await writeFreshnessCache(env, { latest, checkedAt: now });
  return compareFreshness(installed, latest);
}
function freshnessRelay(freshness, source2) {
  if (freshness.verdict !== "behind" || source2 !== "local") return void 0;
  const { installed, latest } = freshness;
  return `A newer harness is published: ${installed} is installed, ${latest ?? "a newer version"} is available. Tell the user this once, near the start of your first reply, and name the command that installs it: \`void-harness update\`. Do not repeat it later in the session.`;
}

import { existsSync as existsSync6, mkdirSync as mkdirSync2, readFileSync as readFileSync8, readdirSync as readdirSync2, renameSync as renameSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname5, join as join9 } from "node:path";

import { lstatSync as lstatSync2, readFileSync as readFileSync7, readdirSync, statSync as statSync3 } from "node:fs";
import { join as join8 } from "node:path";
var MISSION_DIRECTORY = /^mis_[A-Za-z0-9_-]{8,100}$/;
var MAX_MISSION_LOGS = 1e4;
var MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
function regularFile(path) {
  try {
    const info = lstatSync2(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}
function missionEntries(runs) {
  try {
    const info = lstatSync2(runs);
    if (!info.isDirectory() || info.isSymbolicLink()) return [];
    return readdirSync(runs, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && MISSION_DIRECTORY.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_MISSION_LOGS);
  } catch {
    return [];
  }
}
function journalFiles(root) {
  const locations = [voidMachinePath(root, "runs"), legacyVoidPath(root, "runs")].filter((directory, index, all) => all.indexOf(directory) === index);
  const files = [];
  for (const runs of locations) {
    for (const entry of missionEntries(runs)) {
      const path = join8(runs, entry.name, "events.jsonl");
      if (!regularFile(path)) continue;
      try {
        const info = statSync3(path);
        files.push({ path, modifiedMs: info.mtimeMs, bytes: info.size });
      } catch {
      }
    }
  }
  return files;
}
function readMissionJournals(root, options = {}) {
  const ceiling = options.maxBytes ?? MAX_JOURNAL_BYTES;
  let files = journalFiles(root);
  if (options.recentMissions !== void 0) {
    files = [...files].sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, Math.max(0, options.recentMissions));
  }
  const parts = [];
  let bytes = 0;
  for (const file of [...files].sort((a, b) => a.modifiedMs - b.modifiedMs)) {
    if (file.bytes > ceiling || bytes + file.bytes > ceiling) break;
    try {
      parts.push(readFileSync7(file.path, "utf8"));
      bytes += file.bytes;
    } catch {
    }
  }
  return parts.join("\n");
}
function journalFingerprint(root) {
  let bytes = 0;
  let newest = 0;
  for (const file of journalFiles(root)) {
    bytes += file.bytes;
    if (file.modifiedMs > newest) newest = file.modifiedMs;
  }
  return `${Math.round(newest)}:${bytes}`;
}

var RETIRED_SKILLS = {
  "accessibility-first": "void-accessibility",
  "adr-workflow": "void-decide",
  "autonomous-backlog-loop": "void-autopilot",
  "backlog-autopilot": "void-autopilot",
  "backlog-batch": "void-autopilot",
  brainstorming: "void-brainstorm",
  "capture-rule": "void-learn",
  "claude-md-authoring": "void-claude-md",
  compounding: "void-learn",
  "context-management": "void-context",
  "harness-evolution": "void-learn",
  "learning-capture": "void-learn",
  "migrations-safety": "void-migrations",
  refactoring: "void-refactor",
  "session-handoff": "void-checkpoint",
  "systematic-debugging": "void-debug",
  "ticket-runner": "void-implement",
  "ticket-writer": "void-ticket",
  "verification-before-completion": "void-verify",
  "void-backlog-loop": "void-autopilot",
  "void-feedback": "void-learn",
  "writing-plans": "void-plan",
  // Every skill this harness ships gained the `void-` prefix. A project installed
  // before that carries journals full of the bare names, and someone who learnt
  // `/tdd` will type it again: both must land on an answer rather than on silence.
  accessibility: "void-accessibility",
  "accessibility-check": "void-accessibility-check",
  "api-and-interface-design": "void-api-and-interface-design",
  "async-safety": "void-async-safety",
  autopilot: "void-autopilot",
  "background-job-pattern": "void-background-job-pattern",
  brainstorm: "void-brainstorm",
  "cache-component-pattern": "void-cache-component-pattern",
  checkpoint: "void-checkpoint",
  "claude-md": "void-claude-md",
  "client-vs-server-component": "void-client-vs-server-component",
  "code-review": "void-code-review",
  "commit-discipline": "void-commit-discipline",
  context: "void-context",
  debug: "void-debug",
  decide: "void-decide",
  "dependency-direction": "void-dependency-direction",
  "devex-audit": "void-devex-audit",
  "domain-driven-design": "void-domain-driven-design",
  "drizzle-migration-safe": "void-drizzle-migration-safe",
  "eas-build-profile": "void-eas-build-profile",
  "env-validation": "void-env-validation",
  "expo-config-plugins": "void-expo-config-plugins",
  "expo-router-pattern": "void-expo-router-pattern",
  "form-pattern": "void-form-pattern",
  "frontend-design": "void-frontend-design",
  functional: "void-functional",
  "hexagonal-architecture": "void-hexagonal-architecture",
  implement: "void-implement",
  "install-prompt-ux": "void-install-prompt-ux",
  "instrumentation-setup": "void-instrumentation-setup",
  learn: "void-learn",
  "llm-cost-discipline": "void-llm-cost-discipline",
  "loading-error-boundaries": "void-loading-error-boundaries",
  "make-pdf": "void-make-pdf",
  "manifest-checklist": "void-manifest-checklist",
  merge: "void-merge",
  migrations: "void-migrations",
  observability: "void-observability",
  "offline-first-mutation": "void-offline-first-mutation",
  "ota-update-strategy": "void-ota-update-strategy",
  "package-extraction": "void-package-extraction",
  "parallel-routes-slots": "void-parallel-routes-slots",
  plan: "void-plan",
  "plan-review": "void-plan-review",
  qa: "void-qa",
  "rate-limit-strategy": "void-rate-limit-strategy",
  refactor: "void-refactor",
  retrospective: "void-retrospective",
  "route-group-decision": "void-route-group-decision",
  "security-audit": "void-security-audit",
  "security-guidance": "void-security-guidance",
  "server-action": "void-server-action",
  "service-package": "void-service-package",
  "service-worker-strategy": "void-service-worker-strategy",
  "source-driven-development": "void-source-driven-development",
  "state-architecture": "void-state-architecture",
  tdd: "void-tdd",
  testing: "void-testing",
  "testing-server-modules": "void-testing-server-modules",
  ticket: "void-ticket",
  "turbo-pipeline-tuning": "void-turbo-pipeline-tuning",
  "typescript-strict": "void-typescript-strict",
  "ui-review": "void-ui-review",
  verify: "void-verify",
  "webhook-handler-pattern": "void-webhook-handler-pattern"
};
function wasEverOurs(name) {
  return Object.hasOwn(RETIRED_SKILLS, name);
}

var SKILL_RUNTIME_DIRS = [".claude", ".agents"];
function bareName(raw) {
  const colon = raw.lastIndexOf(":");
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}
function installedSkillNames(root) {
  const names = /* @__PURE__ */ new Set();
  for (const runtime3 of SKILL_RUNTIME_DIRS) {
    const skills = join9(root, runtime3, "skills");
    let entries;
    try {
      entries = readdirSync2(skills, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (existsSync6(join9(skills, entry.name, "SKILL.md"))) names.add(entry.name);
    }
  }
  return names;
}
function eachEvent(body, visit) {
  for (const line of body.split("\n")) {
    if (line === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const record8 = parsed;
    const payload = record8["payload"];
    const category = typeof payload === "object" && payload !== null ? payload["category"] : void 0;
    visit({
      kind: typeof record8["kind"] === "string" ? record8["kind"] : "",
      missionId: typeof record8["missionId"] === "string" ? record8["missionId"] : "",
      category: typeof category === "string" ? category : "",
      subject: typeof record8["subject"] === "string" ? record8["subject"] : "",
      ts: typeof record8["ts"] === "string" ? record8["ts"] : ""
    });
  }
}
var LIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1e3;
function newestMission(body, nowMs) {
  let latest = "";
  let mission = "";
  eachEvent(body, (event) => {
    if (event.kind !== "runtime.tool.started") return;
    if (nowMs !== void 0) {
      const at = Date.parse(event.ts);
      if (!Number.isNaN(at) && at < nowMs - LIVE_WINDOW_MS) return;
    }
    if (event.ts > latest) {
      latest = event.ts;
      mission = event.missionId;
    }
  });
  return mission;
}
function recordedSkillNames(body, nowMs) {
  const names = [];
  const floor = nowMs === void 0 ? void 0 : nowMs - LIVE_WINDOW_MS;
  eachEvent(body, (event) => {
    if (event.kind !== "runtime.tool.started" || event.category !== "skill") return;
    if (!event.subject.startsWith("skill:")) return;
    if (floor !== void 0) {
      const at = Date.parse(event.ts);
      if (!Number.isNaN(at) && at < floor) return;
    }
    names.push({ name: bareName(event.subject.slice("skill:".length)), missionId: event.missionId });
  });
  return names;
}
function replacementFor(name) {
  return RETIRED_SKILLS[name];
}
function resolutionVerdict(body, installed, options = {}) {
  const recorded = recordedSkillNames(body, options.nowMs);
  const ours = (entry) => !installed.has(entry.name) && wasEverOurs(entry.name);
  const retired = [...new Set(recorded.filter(ours).map((entry) => entry.name))].sort();
  const newest = newestMission(body, options.nowMs);
  const unresolved2 = [
    ...new Set(recorded.filter((entry) => ours(entry) && entry.missionId === newest).map((entry) => entry.name))
  ].sort();
  return { ok: unresolved2.length === 0, unresolved: unresolved2, retired };
}
function withSuccessor(name) {
  const replacement = replacementFor(name);
  return replacement === void 0 ? name : `${name} -> ${replacement}`;
}
var MAX_NAMED = 5;
function invocationAlert(resolution, liveness) {
  if (resolution.ok && liveness.ok) return void 0;
  const lines = ["void-harness, invocation surface:"];
  if (!resolution.ok) {
    const named = resolution.unresolved.slice(0, MAX_NAMED).map(withSuccessor).join(", ");
    const rest = resolution.unresolved.length - MAX_NAMED;
    const tail = rest > 0 ? `, and ${rest} more` : "";
    lines.push(
      `  ${resolution.unresolved.length} skill invocation(s) in this run name a skill that no longer exists: ${named}${tail}`
    );
  }
  if (!liveness.ok) {
    lines.push(
      `  no skill fired in the last ${liveness.missions} working missions (${liveness.toolCalls} tool calls)`
    );
  }
  lines.push("  run `void-harness doctor` for the detail");
  return lines.join("\n");
}
var WORKING_MISSION_CALLS = 20;
var LIVENESS_WINDOW = 3;
function livenessVerdict(body) {
  const tallies = /* @__PURE__ */ new Map();
  eachEvent(body, (event) => {
    if (event.kind !== "runtime.tool.started" || event.missionId === "") return;
    const tally = tallies.get(event.missionId) ?? { toolCalls: 0, skillCalls: 0, lastTs: "" };
    tally.toolCalls += 1;
    if (event.category === "skill") tally.skillCalls += 1;
    if (event.ts > tally.lastTs) tally.lastTs = event.ts;
    tallies.set(event.missionId, tally);
  });
  const judged = [...tallies.values()].filter((tally) => tally.toolCalls >= WORKING_MISSION_CALLS).sort((a, b) => a.lastTs < b.lastTs ? 1 : a.lastTs > b.lastTs ? -1 : 0).slice(0, LIVENESS_WINDOW);
  const toolCalls = judged.reduce((total, tally) => total + tally.toolCalls, 0);
  const skillCalls = judged.reduce((total, tally) => total + tally.skillCalls, 0);
  const ok = judged.length < LIVENESS_WINDOW || judged.some((tally) => tally.skillCalls > 0);
  return { ok, missions: judged.length, toolCalls, skillCalls };
}
var REFRESH_MISSIONS = 20;
function cachePath(root) {
  return voidMachinePath(root, "invocation.json");
}
function cachedInvocationAlert(root) {
  try {
    const parsed = JSON.parse(readFileSync8(cachePath(root), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return void 0;
    const alert = parsed["alert"];
    return typeof alert === "string" && alert !== "" ? alert : void 0;
  } catch {
    return void 0;
  }
}
function refreshInvocationVerdict(root) {
  try {
    const fingerprint = journalFingerprint(root);
    const path = cachePath(root);
    try {
      const previous = JSON.parse(readFileSync8(path, "utf8"));
      if (typeof previous === "object" && previous !== null && previous["fingerprint"] === fingerprint) return;
    } catch {
    }
    const journals = readMissionJournals(root, { recentMissions: REFRESH_MISSIONS });
    const alert = invocationAlert(
      resolutionVerdict(journals, installedSkillNames(root), { nowMs: Date.now() }),
      livenessVerdict(journals)
    );
    const entry = alert === void 0 ? { fingerprint } : { fingerprint, alert };
    mkdirSync2(dirname5(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync2(temporary, `${JSON.stringify(entry)}
`);
    renameSync2(temporary, path);
  } catch {
  }
}

var DAY_MS = 864e5;
var STALE_DAYS = 7;
function auditCheckpoint(input) {
  const reasons = [];
  if (input.checkpoint === void 0) reasons.push("checkpoint-absent");
  else if (input.checkpoint.isEmpty) reasons.push("checkpoint-empty");
  if (input.checkpoint !== void 0 && input.checkpointWrittenAt !== void 0 && Math.max(0, input.now - input.checkpointWrittenAt) > STALE_DAYS * DAY_MS) {
    reasons.push("checkpoint-stale");
  }
  if (input.checkpoint?.branch !== void 0 && input.git.branch !== void 0 && input.checkpoint.branch !== input.git.branch) {
    reasons.push("checkpoint-branch-moved");
  }
  if (input.checkpoint?.head !== void 0 && input.git.head !== void 0 && input.checkpoint.head !== input.git.head) {
    reasons.push("checkpoint-head-moved");
  }
  return reasons.length === 0 ? { status: "ok", reasons } : { status: "degraded", reasons };
}

function sessionStartOutput(version, notice, invocationAlert2, resumeContext) {
  const installed = version.trim() === "" ? "unknown" : version.trim();
  const base = `void-harness ${installed} is active. Non-negotiable floor: never edit secrets or keys; never hand-edit lockfiles; regenerate them via the package manager for requested dependency changes; never run destructive shell commands; tests and fresh evidence gate "done". Capture durable project rules explicitly. Run \`void-harness doctor\` if runtime health is uncertain.`;
  const suffix = notice === void 0 || notice.trim() === "" ? "" : ` ${notice.trim()}`;
  const alert = invocationAlert2 === void 0 || invocationAlert2.trim() === "" ? "" : `
${invocationAlert2.trim()}`;
  const resume = resumeContext === void 0 || resumeContext.trim() === "" ? "" : `
${resumeContext.trimEnd()}`;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `${base}${suffix}${alert}${resume}`
    }
  };
}

import { createHash as createHash2 } from "node:crypto";
import {
  closeSync as closeSync3,
  constants as constants3,
  fstatSync as fstatSync2,
  lstatSync as lstatSync4,
  mkdirSync as mkdirSync3,
  openSync as openSync3,
  readSync as readSync3,
  realpathSync as realpathSync4,
  renameSync as renameSync3,
  statSync as statSync4,
  unlinkSync,
  writeSync
} from "node:fs";
import { homedir } from "node:os";
import { basename as basename3, isAbsolute as isAbsolute5, join as join11, relative as relative4, resolve as resolve6 } from "node:path";

import { createHash } from "node:crypto";
var PROSE_SECTIONS = {
  objective: "objective",
  position: "position",
  state: "state",
  "where you are": "state",
  "next action": "nextAction",
  next: "nextAction"
};
var LIST_SECTIONS = {
  "open loops": "openLoops",
  open: "openLoops",
  "dead ends": "deadEnds",
  assumptions: "assumptions",
  "working set": "workingSet",
  files: "workingSet"
};
var MAX_INPUT = 5e5;
var MAX_LINE = 200;
var MAX_ITEMS = 20;
var MAX_PATH = 500;
var MECHANICAL_BEGIN = "<!-- void-harness:context-continuity:begin -->";
var MECHANICAL_END = "<!-- void-harness:context-continuity:end -->";
function hashCheckpointObjective(objective) {
  return `sha256:${createHash("sha256").update(objective?.trim() ?? "").digest("hex")}`;
}
function markerPositions(raw, marker) {
  const positions = [];
  let cursor = 0;
  while (cursor <= raw.length) {
    const found = raw.indexOf(marker, cursor);
    if (found < 0)
      break;
    positions.push(found);
    cursor = found + marker.length;
  }
  return positions;
}
function mechanicalBounds(raw) {
  const begins = markerPositions(raw, MECHANICAL_BEGIN);
  const ends = markerPositions(raw, MECHANICAL_END);
  if (begins.length === 0 && ends.length === 0)
    return { status: "absent" };
  const begin = begins[0];
  const end = ends[0];
  if (begins.length !== 1 || ends.length !== 1 || begin === void 0 || end === void 0) {
    return { status: "invalid" };
  }
  if (end <= begin)
    return { status: "invalid" };
  return { status: "valid", begin, end: end + MECHANICAL_END.length };
}
function semanticMarkdown(raw) {
  const bounds = mechanicalBounds(raw);
  return bounds.status === "valid" ? `${raw.slice(0, bounds.begin)}${raw.slice(bounds.end)}` : raw;
}
function scalar(block2, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, "m").exec(block2)?.[1];
}
function integerScalar(block2, key) {
  const value = Number(scalar(block2, key));
  return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function booleanScalar(block2, key) {
  const value = scalar(block2, key);
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  return void 0;
}
function pathList2(block2, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = new RegExp(`^### ${escaped}\\s*$([\\s\\S]*?)(?=^### |(?![\\s\\S]))`, "m").exec(block2)?.[1];
  if (section === void 0)
    return void 0;
  const paths = section.split(/\r?\n/).map((line) => /^- (.+)$/.exec(line)?.[1]).filter((path) => path !== void 0);
  if (paths.length > MAX_ITEMS)
    return void 0;
  if (paths.some((path) => path.length > MAX_PATH || [...path].some((character) => character.charCodeAt(0) < 32)))
    return void 0;
  return paths;
}
function stateFromMechanicalBody(block2) {
  const objectiveHash = scalar(block2, "objective_hash");
  const transcriptFingerprint = scalar(block2, "transcript_fingerprint");
  const workRevision = integerScalar(block2, "work_revision");
  const semanticRevision = integerScalar(block2, "semantic_revision");
  const sealedWorkRevision = integerScalar(block2, "sealed_work_revision");
  const readFiles = pathList2(block2, "Read files");
  const modifiedFiles = pathList2(block2, "Modified files");
  if (scalar(block2, "schema_version") !== "1" || objectiveHash === void 0 || !/^sha256:[a-f0-9]{64}$/.test(objectiveHash) || transcriptFingerprint === void 0 || !/^sha256:[a-f0-9]{64}$/.test(transcriptFingerprint) || workRevision === void 0 || semanticRevision === void 0 || sealedWorkRevision === void 0 || semanticRevision > workRevision || sealedWorkRevision > workRevision || readFiles === void 0 || modifiedFiles === void 0)
    return void 0;
  return mechanicalScalars(block2, {
    objectiveHash,
    transcriptFingerprint,
    workRevision,
    semanticRevision,
    sealedWorkRevision,
    readFiles,
    modifiedFiles
  });
}
function mechanicalScalars(block2, required) {
  const nudgeEmitted = booleanScalar(block2, "nudge_emitted");
  const unwatchableNotified = booleanScalar(block2, "unwatchable_notified") ?? false;
  const clearPending = booleanScalar(block2, "clear_pending");
  const transcriptCursorBytes = integerScalar(block2, "transcript_cursor_bytes");
  const lastMeasurementAtMs = integerScalar(block2, "last_measurement_at_ms");
  const lastUsedTokens = integerScalar(block2, "last_used_tokens");
  const readFilesOverflow = integerScalar(block2, "read_files_overflow");
  const modifiedFilesOverflow = integerScalar(block2, "modified_files_overflow");
  const lastResumeSource = scalar(block2, "last_resume_source");
  if (nudgeEmitted === void 0 || clearPending === void 0 || transcriptCursorBytes === void 0 || lastMeasurementAtMs === void 0 || lastUsedTokens === void 0 || readFilesOverflow === void 0 || modifiedFilesOverflow === void 0 || !isMechanicalResumeSource(lastResumeSource))
    return void 0;
  return {
    schemaVersion: 1,
    ...required,
    nudgeEmitted,
    unwatchableNotified,
    transcriptCursorBytes,
    lastMeasurementAtMs,
    lastUsedTokens,
    readFilesOverflow,
    modifiedFilesOverflow,
    clearPending,
    lastResumeSource
  };
}
function isMechanicalResumeSource(value) {
  return value === "none" || value === "startup" || value === "resume" || value === "clear" || value === "compact" || value === "fork";
}
function parseMechanicalContextBlock(raw) {
  const bounds = mechanicalBounds(raw);
  if (bounds.status === "absent")
    return { status: "absent" };
  if (bounds.status === "invalid")
    return { status: "invalid", reason: "ambiguous" };
  const body = raw.slice(bounds.begin + MECHANICAL_BEGIN.length, bounds.end - MECHANICAL_END.length);
  const state = stateFromMechanicalBody(body);
  return state === void 0 ? { status: "invalid", reason: "malformed" } : { status: "valid", state };
}
function renderPaths(paths) {
  return paths.map((path) => `- ${path}`).join("\n");
}
function renderMechanicalContextBlock(state) {
  return [
    MECHANICAL_BEGIN,
    "## Mechanical context",
    "",
    "```yaml",
    "schema_version: 1",
    `objective_hash: ${state.objectiveHash}`,
    `work_revision: ${String(state.workRevision)}`,
    `semantic_revision: ${String(state.semanticRevision)}`,
    `sealed_work_revision: ${String(state.sealedWorkRevision)}`,
    `nudge_emitted: ${String(state.nudgeEmitted)}`,
    `unwatchable_notified: ${String(state.unwatchableNotified)}`,
    `transcript_fingerprint: ${state.transcriptFingerprint}`,
    `transcript_cursor_bytes: ${String(state.transcriptCursorBytes)}`,
    `last_measurement_at_ms: ${String(state.lastMeasurementAtMs)}`,
    `last_used_tokens: ${String(state.lastUsedTokens)}`,
    `read_files_overflow: ${String(state.readFilesOverflow)}`,
    `modified_files_overflow: ${String(state.modifiedFilesOverflow)}`,
    `clear_pending: ${String(state.clearPending)}`,
    `last_resume_source: ${state.lastResumeSource}`,
    "```",
    "",
    "### Read files",
    "",
    renderPaths(state.readFiles),
    "",
    "### Modified files",
    "",
    renderPaths(state.modifiedFiles),
    MECHANICAL_END
  ].join("\n");
}
function mergeRecentPaths(current, overflow, observed) {
  if (observed === void 0 || observed.length === 0) {
    return { paths: current, overflow, changed: false };
  }
  const uniqueObserved = [...new Set(observed)];
  const merged = [
    ...current.filter((path) => !uniqueObserved.includes(path)),
    ...uniqueObserved
  ];
  const displaced = Math.max(0, merged.length - MAX_ITEMS);
  const paths = merged.slice(displaced);
  const changed = displaced > 0 || paths.length !== current.length || paths.some((path, index) => path !== current[index]);
  return {
    paths: changed ? paths : current,
    overflow: overflow + displaced,
    changed
  };
}
function advanceMechanicalContext(state, observation) {
  if (observation.objectiveHash !== void 0 && observation.objectiveHash !== state.objectiveHash) {
    const revision = state.workRevision + 1;
    return {
      ...state,
      objectiveHash: observation.objectiveHash,
      workRevision: revision,
      semanticRevision: revision,
      sealedWorkRevision: 0,
      nudgeEmitted: false,
      unwatchableNotified: false,
      readFiles: [],
      modifiedFiles: [],
      readFilesOverflow: 0,
      modifiedFilesOverflow: 0,
      clearPending: false
    };
  }
  const reads = mergeRecentPaths(state.readFiles, state.readFilesOverflow, observation.readFiles);
  const modifications = mergeRecentPaths(state.modifiedFiles, state.modifiedFilesOverflow, observation.modifiedFiles);
  const tokensChanged = observation.usedTokens !== void 0 && observation.usedTokens !== state.lastUsedTokens;
  const sourceChanged = observation.resumeSource !== void 0 && observation.resumeSource !== state.lastResumeSource;
  const cycleChanged = observation.resumeSource === "compact" ? state.nudgeEmitted : observation.resumeSource === "clear" && !state.clearPending;
  const workChanged = reads.changed || modifications.changed || tokensChanged || sourceChanged || cycleChanged;
  const workRevision = state.workRevision + (workChanged ? 1 : 0);
  const reconcile = observation.semanticCheckpointWritten === true;
  const sealChanged = observation.compactionSealed === true && state.sealedWorkRevision !== workRevision;
  if (!workChanged && !reconcile && !sealChanged)
    return state;
  return {
    ...state,
    workRevision,
    semanticRevision: reconcile ? workRevision : state.semanticRevision,
    sealedWorkRevision: observation.compactionSealed === true ? workRevision : reconcile ? 0 : state.sealedWorkRevision,
    nudgeEmitted: observation.resumeSource === "clear" || observation.resumeSource === "compact" ? false : state.nudgeEmitted,
    unwatchableNotified: observation.resumeSource === "clear" || observation.resumeSource === "compact" ? false : state.unwatchableNotified,
    lastUsedTokens: observation.usedTokens ?? state.lastUsedTokens,
    readFiles: reads.paths,
    modifiedFiles: modifications.paths,
    readFilesOverflow: reads.overflow,
    modifiedFilesOverflow: modifications.overflow,
    clearPending: reconcile ? false : observation.resumeSource === "clear" || state.clearPending,
    lastResumeSource: observation.resumeSource ?? state.lastResumeSource
  };
}
function evaluateContextMeasurement(state, measurement) {
  const usedTokens = Number.isSafeInteger(measurement.usedTokens) && measurement.usedTokens >= 0 ? measurement.usedTokens : state.lastUsedTokens;
  const tokensChanged = usedTokens !== state.lastUsedTokens;
  const windowKnown = Number.isSafeInteger(measurement.windowTokens) && (measurement.windowTokens ?? 0) > 0;
  const thresholdValid = Number.isSafeInteger(measurement.thresholdPercent) && measurement.thresholdPercent >= 40 && measurement.thresholdPercent <= 60;
  const usagePercent = windowKnown ? usedTokens / (measurement.windowTokens ?? 1) * 100 : void 0;
  const revisionAfterTokens = state.workRevision + (tokensChanged ? 1 : 0);
  const unjudgeable = !windowKnown ? "window-unknown" : thresholdValid ? void 0 : "threshold-unusable";
  const emitNudge = usagePercent !== void 0 && thresholdValid && usagePercent >= measurement.thresholdPercent && !state.nudgeEmitted && state.semanticRevision < revisionAfterTokens;
  const workChanged = tokensChanged || emitNudge;
  const measuredAtMs = Number.isSafeInteger(measurement.measuredAtMs) && measurement.measuredAtMs >= 0 ? measurement.measuredAtMs : state.lastMeasurementAtMs;
  const changed = workChanged || measuredAtMs !== state.lastMeasurementAtMs;
  const next = changed ? {
    ...state,
    workRevision: state.workRevision + (workChanged ? 1 : 0),
    nudgeEmitted: state.nudgeEmitted || emitNudge,
    lastMeasurementAtMs: measuredAtMs,
    lastUsedTokens: usedTokens
  } : state;
  return {
    state: next,
    emitNudge,
    ...usagePercent === void 0 ? {} : { usagePercent },
    ...unjudgeable === void 0 ? {} : { unjudgeable }
  };
}
function mergeMechanicalContextBlock(raw, state) {
  const bounds = mechanicalBounds(raw);
  if (bounds.status === "invalid")
    return { ok: false, error: "ambiguous-mechanical-block" };
  const block2 = renderMechanicalContextBlock(state);
  if (bounds.status === "absent") {
    const separator = raw === "" || raw.endsWith("\n\n") ? "" : raw.endsWith("\n") ? "\n" : "\n\n";
    return { ok: true, value: `${raw}${separator}${block2}
` };
  }
  return {
    ok: true,
    value: `${raw.slice(0, bounds.begin)}${block2}${raw.slice(bounds.end)}`
  };
}
function clamp(text2) {
  const flat = [...text2].filter((ch) => {
    const point = ch.codePointAt(0) ?? 0;
    return point >= 32 || ch === "\n" || ch === "	";
  }).join("").trim();
  return flat.length <= MAX_LINE ? flat : `${flat.slice(0, MAX_LINE - 1)}\u2026`;
}
function frontmatterField(raw, key) {
  const block2 = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1];
  if (block2 === void 0)
    return void 0;
  for (const line of block2.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1)
      continue;
    if (line.slice(0, separator).trim().toLowerCase() !== key)
      continue;
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    return value === "" ? void 0 : clamp(value);
  }
  return void 0;
}
function bodyOf(raw) {
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n([\s\S]*))?$/.exec(raw)?.[1] ?? raw;
}
function sectionsOf(body) {
  const found = [];
  for (const line of body.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line) ?? void 0;
    if (heading !== void 0) {
      found.push({ title: (heading[1] ?? "").toLowerCase().replace(/\s+/g, " ").trim(), lines: [] });
      continue;
    }
    found[found.length - 1]?.lines.push(line);
  }
  return found;
}
function prose(lines) {
  const text2 = lines.join("\n").trim();
  return text2 === "" ? void 0 : text2;
}
function bullets(lines) {
  const items = [];
  let open2 = false;
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)?.[1];
    if (bullet !== void 0) {
      items.push(bullet);
      open2 = true;
      continue;
    }
    if (line.trim() === "") {
      open2 = false;
      continue;
    }
    if (open2 && items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1] ?? ""} ${line.trim()}`;
    }
  }
  return items.map((item) => clamp(item)).filter((item) => item !== "").slice(0, MAX_ITEMS);
}
function parseCheckpoint(raw) {
  const bounded = raw.length > MAX_INPUT ? raw.slice(0, MAX_INPUT) : raw;
  const mechanical = parseMechanicalContextBlock(bounded);
  const semantic = semanticMarkdown(bounded);
  const proseFields = {};
  const listFields = {
    openLoops: [],
    deadEnds: [],
    assumptions: [],
    workingSet: []
  };
  for (const section of sectionsOf(bodyOf(semantic))) {
    const proseKey = PROSE_SECTIONS[section.title];
    if (proseKey !== void 0) {
      const text2 = prose(section.lines);
      if (text2 !== void 0)
        proseFields[proseKey] = text2;
      continue;
    }
    const listKey = LIST_SECTIONS[section.title];
    if (listKey !== void 0)
      listFields[listKey] = bullets(section.lines);
  }
  const objective = proseFields["objective"];
  const nextAction = proseFields["nextAction"];
  const resumeSource = objective ?? nextAction;
  const resumeLine = resumeSource === void 0 ? void 0 : clamp(resumeSource.split("\n")[0] ?? "");
  const branch = frontmatterField(bounded, "branch");
  const head = frontmatterField(bounded, "head");
  const date = frontmatterField(bounded, "date");
  const isEmpty = objective === void 0 && nextAction === void 0 && proseFields["state"] === void 0 && proseFields["position"] === void 0 && Object.values(listFields).every((items) => items.length === 0) && mechanical.status !== "valid";
  return {
    ...objective === void 0 ? {} : { objective },
    ...proseFields["position"] === void 0 ? {} : { position: proseFields["position"] },
    ...proseFields["state"] === void 0 ? {} : { state: proseFields["state"] },
    ...nextAction === void 0 ? {} : { nextAction },
    openLoops: listFields["openLoops"] ?? [],
    deadEnds: listFields["deadEnds"] ?? [],
    assumptions: listFields["assumptions"] ?? [],
    workingSet: listFields["workingSet"] ?? [],
    ...branch === void 0 ? {} : { branch },
    ...head === void 0 ? {} : { head },
    ...date === void 0 ? {} : { date },
    ...resumeLine === void 0 || resumeLine === "" ? {} : { resumeLine },
    ...mechanical.status === "valid" ? { mechanicalContext: mechanical.state } : {},
    mechanicalBlockStatus: mechanical.status,
    isEmpty
  };
}

var DAY_MS2 = 864e5;
var STALE_DAYS2 = 7;
var CONTEXT_CHARS_MAX = 4e3;
function summarizeProgram(descriptor) {
  return {
    status: descriptor.status,
    program: descriptor.program,
    plan: descriptor.plan,
    spec: descriptor.spec,
    ...descriptor.progress === void 0 ? {} : {
      progress: {
        provider: descriptor.progress.provider,
        scope: descriptor.progress.scope
      }
    }
  };
}
function programGap(input) {
  if (input.programError !== void 0) {
    return { reason: "program-invalid", detail: input.programError };
  }
  if (input.program === void 0) {
    return {
      reason: "program-absent",
      detail: "no .void/program.md; resume can still use a local checkpoint and Git"
    };
  }
  return void 0;
}
function checkpointGap(input) {
  if (input.checkpoint === void 0) {
    return {
      reason: "checkpoint-absent",
      detail: "no .void/machine/checkpoint.md; invoke void-checkpoint before ending a session"
    };
  }
  if (input.checkpoint.isEmpty) {
    return {
      reason: "checkpoint-empty",
      detail: "the checkpoint exists but carries no recognised session residue"
    };
  }
  if (input.checkpointWrittenAt === void 0)
    return void 0;
  const ageDays = Math.max(0, Math.floor((input.now - input.checkpointWrittenAt) / DAY_MS2));
  return ageDays > STALE_DAYS2 ? {
    reason: "checkpoint-stale",
    detail: `the checkpoint is ${String(ageDays)} days old`
  } : void 0;
}
function treeGaps(input) {
  const gaps = [];
  const checkpoint = input.checkpoint;
  if (checkpoint?.branch !== void 0 && input.git.branch !== void 0 && checkpoint.branch !== input.git.branch) {
    gaps.push({
      reason: "checkpoint-branch-moved",
      detail: `checkpoint branch ${checkpoint.branch}; current branch ${input.git.branch}`
    });
  }
  if (checkpoint?.head !== void 0 && input.git.head !== void 0 && checkpoint.head !== input.git.head) {
    gaps.push({
      reason: "checkpoint-head-moved",
      detail: `checkpoint HEAD ${checkpoint.head}; current HEAD ${input.git.head}`
    });
  }
  return gaps;
}
function continuityFor(input) {
  if (input.resumeSource === "clear") {
    return { status: "degraded", reasons: ["clear-not-reconciled"] };
  }
  const checkpoint = input.checkpoint;
  if (checkpoint?.mechanicalBlockStatus === "invalid") {
    return { status: "degraded", reasons: ["mechanical-block-invalid"] };
  }
  const mechanical = checkpoint?.mechanicalContext;
  if (mechanical === void 0) {
    return { status: "degraded", reasons: ["mechanical-block-absent"] };
  }
  const reasons = [];
  if (mechanical.semanticRevision < mechanical.workRevision) {
    reasons.push("semantic-revision-behind");
  }
  if (input.resumeSource === "compact" && mechanical.sealedWorkRevision !== mechanical.workRevision) {
    reasons.push("precompact-seal-unconfirmed");
  }
  if (mechanical.clearPending)
    reasons.push("clear-not-reconciled");
  return reasons.length === 0 ? { status: "complete", reasons } : { status: "degraded", reasons };
}
function continuityGaps(continuity) {
  return continuity.reasons.map((reason) => {
    switch (reason) {
      case "mechanical-block-absent":
        return { reason, detail: "the mechanical context block is absent" };
      case "mechanical-block-invalid":
        return { reason, detail: "the mechanical context block is ambiguous or malformed" };
      case "semantic-revision-behind":
        return {
          reason: "checkpoint-semantic-stale",
          detail: "the semantic revision is behind mechanical work"
        };
      case "precompact-seal-unconfirmed":
        return {
          reason,
          detail: "the pre-compaction seal is not confirmed for the latest work revision"
        };
      case "clear-not-reconciled":
        return { reason: "clear-unreconciled", detail: "the last clear is not reconciled" };
      default: {
        const exhaustive = reason;
        return exhaustive;
      }
    }
  });
}
function composeResumeBundle(input) {
  const continuity = continuityFor(input);
  const gaps = [
    programGap(input),
    checkpointGap(input),
    ...treeGaps(input),
    ...continuityGaps(continuity)
  ].filter((gap) => gap !== void 0);
  return {
    schemaVersion: 1,
    project: input.project,
    ...input.program === void 0 ? {} : { program: summarizeProgram(input.program) },
    ...input.checkpoint === void 0 ? {} : { checkpoint: input.checkpoint },
    git: {
      ...input.git.branch === void 0 ? {} : { branch: input.git.branch },
      ...input.git.head === void 0 ? {} : { head: input.git.head },
      dirtyFiles: input.git.dirtyFiles
    },
    gaps,
    continuity
  };
}
function checkpointContext(checkpoint) {
  const mechanical = checkpoint.mechanicalContext;
  const readOverflow = mechanical === void 0 || mechanical.readFilesOverflow === 0 ? "" : ` (+${String(mechanical.readFilesOverflow)} older)`;
  const modifiedOverflow = mechanical === void 0 || mechanical.modifiedFilesOverflow === 0 ? "" : ` (+${String(mechanical.modifiedFilesOverflow)} older)`;
  return [
    checkpoint.date === void 0 ? void 0 : `Checkpoint date: ${checkpoint.date}`,
    checkpoint.objective === void 0 ? void 0 : `Objective: ${checkpoint.objective}`,
    checkpoint.position === void 0 ? void 0 : `Position: ${checkpoint.position}`,
    checkpoint.state === void 0 ? void 0 : `State: ${checkpoint.state}`,
    checkpoint.nextAction === void 0 ? void 0 : `Next action: ${checkpoint.nextAction}`,
    checkpoint.openLoops.length === 0 ? void 0 : `Open loops: ${checkpoint.openLoops.join("; ")}`,
    checkpoint.deadEnds.length === 0 ? void 0 : `Dead ends: ${checkpoint.deadEnds.join("; ")}`,
    checkpoint.assumptions.length === 0 ? void 0 : `Unverified assumptions: ${checkpoint.assumptions.join("; ")}`,
    mechanical === void 0 || mechanical.readFiles.length === 0 ? void 0 : `Read files: ${mechanical.readFiles.join(", ")}${readOverflow}`,
    mechanical === void 0 || mechanical.modifiedFiles.length === 0 ? void 0 : `Modified files: ${mechanical.modifiedFiles.join(", ")}${modifiedOverflow}`
  ].filter((line) => line !== void 0);
}
function boundedResumeLines(required, optional) {
  const requiredText = required.join("\n");
  const remaining = CONTEXT_CHARS_MAX - requiredText.length - 1;
  if (remaining <= 0 || optional.length === 0) {
    return `${requiredText.slice(0, CONTEXT_CHARS_MAX - 1)}
`;
  }
  const optionalText = optional.join("\n");
  const boundedOptional = optionalText.length <= remaining ? optionalText : `${optionalText.slice(0, Math.max(0, remaining - 3))}...`;
  return `${requiredText}
${boundedOptional}
`.slice(0, CONTEXT_CHARS_MAX);
}
function renderResumeContext(bundle) {
  const usefulCheckpoint = bundle.checkpoint !== void 0 && !bundle.checkpoint.isEmpty;
  if (bundle.program === void 0 && !usefulCheckpoint && bundle.continuity.status === "complete")
    return "";
  const continuityReasons = /* @__PURE__ */ new Set([
    "mechanical-block-absent",
    "mechanical-block-invalid",
    "checkpoint-semantic-stale",
    "precompact-seal-unconfirmed",
    "clear-unreconciled"
  ]);
  const required = [
    "[void-harness resume]",
    `Project: ${bundle.project.name}`,
    `Context continuity: ${bundle.continuity.status}`,
    ...bundle.continuity.status === "degraded" ? ["Reconstruct context before any mutation."] : [],
    ...bundle.gaps.filter((gap) => continuityReasons.has(gap.reason)).map((gap) => `Gap: ${gap.detail}`)
  ];
  const optional = [];
  if (bundle.git.branch !== void 0)
    optional.push(`Branch: ${bundle.git.branch}`);
  if (bundle.git.head !== void 0)
    optional.push(`HEAD: ${bundle.git.head}`);
  if (bundle.git.dirtyFiles > 0)
    optional.push(`Dirty files: ${String(bundle.git.dirtyFiles)}`);
  if (bundle.program !== void 0) {
    optional.push(`Program: ${bundle.program.program}`);
    optional.push(`Plan: ${bundle.program.plan}`);
    optional.push(`Spec: ${bundle.program.spec}`);
    if (bundle.program.progress !== void 0) {
      optional.push(`Progress: ${bundle.program.progress.provider} at ${bundle.program.progress.scope}`);
    }
  }
  if (usefulCheckpoint && bundle.checkpoint !== void 0) {
    optional.push(...checkpointContext(bundle.checkpoint));
  }
  optional.push(...bundle.gaps.filter((gap) => !continuityReasons.has(gap.reason)).map((gap) => `Gap: ${gap.detail}`));
  return boundedResumeLines(required, optional);
}

import {
  accessSync,
  constants as constants2,
  lstatSync as lstatSync3,
  readFileSync as readFileSync9,
  realpathSync as realpathSync3
} from "node:fs";
import { delimiter, isAbsolute as isAbsolute4, join as join10, relative as relative3 } from "node:path";
function record3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
function within(root, target) {
  const rel = relative3(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute4(rel);
}
function executable(path) {
  try {
    accessSync(path, process.platform === "win32" ? constants2.F_OK : constants2.X_OK);
    return true;
  } catch {
    return false;
  }
}
function findExecutable(name, root, env) {
  if ((isAbsolute4(name) || name.includes("/") || name.includes("\\")) && executable(name)) {
    return name;
  }
  const suffixes = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  const local = join10(root, "node_modules", ".bin", name);
  for (const suffix of suffixes) {
    if (executable(`${local}${suffix}`)) return `${local}${suffix}`;
  }
  for (const directory of (env["PATH"] ?? "").split(delimiter)) {
    if (directory === "") continue;
    for (const suffix of suffixes) {
      const candidate = join10(directory, `${name}${suffix}`);
      if (executable(candidate)) return candidate;
    }
  }
  return void 0;
}
function safeExistingFiles(paths, root) {
  const canonicalRoot = realpathSync3(root);
  return paths.filter((path) => {
    try {
      const info = lstatSync3(path);
      if (!info.isFile() || info.isSymbolicLink()) return false;
      return within(canonicalRoot, realpathSync3(path));
    } catch {
      return false;
    }
  });
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync9(path, "utf8"));
  } catch {
    return void 0;
  }
}

var CHECKPOINT = join11(".void", "machine", "checkpoint.md");
var MAX_CHECKPOINT_BYTES = 5e5;
var LOCK_STALE_MS = 1e3;
var POST_TOOL_MEASUREMENT_COOLDOWN_MS = 5e3;
var MAX_TRANSCRIPT_BYTES = 1048576;
var MAX_CONFIG_BYTES = 65536;
var EMPTY_TRANSCRIPT_HASH = `sha256:${createHash2("sha256").update("").digest("hex")}`;
var MECHANICAL_BEGIN2 = "<!-- void-harness:context-continuity:begin -->";
var MECHANICAL_END2 = "<!-- void-harness:context-continuity:end -->";
var MAX_RECOVERY_GENERATIONS = 16;
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function rawCheckpoint(path) {
  let descriptor;
  try {
    const info = lstatSync4(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CHECKPOINT_BYTES) return void 0;
    descriptor = openSync3(
      path,
      constants3.O_RDONLY | constants3.O_NONBLOCK | (constants3.O_NOFOLLOW ?? 0)
    );
    const opened = fstatSync2(descriptor);
    if (!opened.isFile() || opened.size > MAX_CHECKPOINT_BYTES) return void 0;
    return readBoundedDescriptor(descriptor, MAX_CHECKPOINT_BYTES);
  } catch (error) {
    return errorCode(error) === "ENOENT" ? "" : void 0;
  } finally {
    if (descriptor !== void 0) closeSync3(descriptor);
  }
}
function initialState(raw) {
  const parsed = parseCheckpoint(raw);
  const hasSemantic = parsed.objective !== void 0 || parsed.nextAction !== void 0;
  return {
    schemaVersion: 1,
    objectiveHash: hashCheckpointObjective(parsed.objective),
    workRevision: 1,
    semanticRevision: hasSemantic ? 1 : 0,
    sealedWorkRevision: 0,
    nudgeEmitted: false,
    unwatchableNotified: false,
    transcriptFingerprint: EMPTY_TRANSCRIPT_HASH,
    transcriptCursorBytes: 0,
    lastMeasurementAtMs: 0,
    lastUsedTokens: 0,
    readFiles: [],
    modifiedFiles: [],
    readFilesOverflow: 0,
    modifiedFilesOverflow: 0,
    clearPending: false,
    lastResumeSource: "none"
  };
}
function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
function unlinkOwnedPath(path, owner) {
  try {
    const current = lstatSync4(path);
    if (!sameFile(current, owner)) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}
function staleFile(info, now) {
  return now - Math.max(info.mtimeMs, info.ctimeMs) >= LOCK_STALE_MS;
}
function openExclusive(path) {
  try {
    const descriptor = openSync3(
      path,
      constants3.O_WRONLY | constants3.O_CREAT | constants3.O_EXCL | (constants3.O_NOFOLLOW ?? 0),
      384
    );
    const info = fstatSync2(descriptor);
    return { descriptor, dev: info.dev, ino: info.ino };
  } catch {
    return void 0;
  }
}
function releaseLock(path, lock) {
  try {
    closeSync3(lock.descriptor);
  } finally {
    unlinkOwnedPath(path, lock);
  }
}
function acquireLock(path, now) {
  const recovery = readRecoveryClaim(`${path}.recovery`);
  if (recovery.status === "unsafe") return void 0;
  if (recovery.status === "present") {
    try {
      const observed2 = lstatSync4(path);
      if (!observed2.isFile() || observed2.isSymbolicLink() || !staleFile(observed2, now)) {
        return void 0;
      }
      return claimStaleLock(path, observed2, now);
    } catch (error) {
      return errorCode(error) === "ENOENT" ? claimStaleLock(path, void 0, now) : void 0;
    }
  }
  const direct = openExclusive(path);
  if (direct !== void 0) {
    const afterOpen = readRecoveryClaim(`${path}.recovery`);
    if (afterOpen.status === "missing") return direct;
    releaseLock(path, direct);
    return void 0;
  }
  let observed;
  try {
    observed = lstatSync4(path);
    if (!observed.isFile() || observed.isSymbolicLink() || !staleFile(observed, now)) {
      return void 0;
    }
  } catch {
    return void 0;
  }
  return claimStaleLock(path, observed, now);
}
function readRecoveryClaim(path) {
  try {
    const info = lstatSync4(path);
    return !info.isFile() || info.isSymbolicLink() ? { status: "unsafe" } : {
      status: "present",
      claim: {
        path,
        dev: info.dev,
        ino: info.ino,
        mtimeMs: info.mtimeMs,
        ctimeMs: info.ctimeMs
      }
    };
  } catch (error) {
    return { status: errorCode(error) === "ENOENT" ? "missing" : "unsafe" };
  }
}
function acquireRecoveryFence(path, now) {
  const claims = [];
  let claimPath = `${path}.recovery`;
  let generation = 0;
  while (generation <= MAX_RECOVERY_GENERATIONS) {
    const read = readRecoveryClaim(claimPath);
    if (read.status === "unsafe") return void 0;
    if (read.status === "missing") {
      const created = openExclusive(claimPath);
      if (created === void 0) return void 0;
      return {
        tip: created,
        claims: [...claims, { ...created, path: claimPath, mtimeMs: now, ctimeMs: now }]
      };
    }
    const claim = read.claim;
    claims.push(claim);
    if (!staleFile(claim, now)) return void 0;
    generation += 1;
    claimPath = `${path}.recovery-${String(generation)}-${String(claim.dev)}-${String(claim.ino)}`;
  }
  return void 0;
}
function releaseRecoveryFence(fence) {
  closeSync3(fence.tip.descriptor);
  for (const claim of [...fence.claims].reverse()) unlinkOwnedPath(claim.path, claim);
}
function claimStaleLock(path, observed, now) {
  const fence = acquireRecoveryFence(path, now);
  if (fence === void 0) return void 0;
  try {
    try {
      const current = lstatSync4(path);
      if (observed === void 0 || !sameFile(current, observed)) return void 0;
      if (!staleFile(current, now)) return void 0;
      if (!unlinkOwnedPath(path, observed)) return void 0;
    } catch (error) {
      if (observed !== void 0 || errorCode(error) !== "ENOENT") return void 0;
    }
    return openExclusive(path);
  } finally {
    releaseRecoveryFence(fence);
  }
}
function safeMachineDirectory(root) {
  try {
    const canonicalRoot = realpathSync4(resolve6(root));
    let cursor = canonicalRoot;
    for (const segment of [".void", "machine"]) {
      cursor = join11(cursor, segment);
      try {
        const existing = lstatSync4(cursor);
        if (!existing.isDirectory() || existing.isSymbolicLink()) return void 0;
      } catch (error) {
        if (errorCode(error) !== "ENOENT") return void 0;
        try {
          mkdirSync3(cursor, { mode: 448 });
        } catch (mkdirError) {
          if (errorCode(mkdirError) !== "EEXIST") return void 0;
        }
        const created = lstatSync4(cursor);
        if (!created.isDirectory() || created.isSymbolicLink()) return void 0;
      }
      const canonical2 = realpathSync4(cursor);
      if (!within(canonicalRoot, canonical2) || canonical2 !== cursor) return void 0;
    }
    return cursor;
  } catch {
    return void 0;
  }
}
function anchorMachineDirectory(root) {
  const directory = safeMachineDirectory(root);
  if (directory === void 0) return void 0;
  let descriptor;
  const previousCwd = process.cwd();
  let changedDirectory = false;
  let anchorEstablished = false;
  try {
    descriptor = openSync3(
      directory,
      constants3.O_RDONLY | (constants3.O_DIRECTORY ?? 0) | (constants3.O_NOFOLLOW ?? 0)
    );
    const opened = fstatSync2(descriptor);
    if (!opened.isDirectory()) return void 0;
    process.chdir(directory);
    changedDirectory = true;
    const current = statSync4(".");
    if (current.dev !== opened.dev || current.ino !== opened.ino || realpathSync4(".") !== directory) return void 0;
    anchorEstablished = true;
    return { descriptor, previousCwd };
  } catch {
    return void 0;
  } finally {
    if (descriptor !== void 0 && !anchorEstablished) {
      if (changedDirectory) process.chdir(previousCwd);
      closeSync3(descriptor);
    }
  }
}
function releaseMachineDirectory(anchor) {
  try {
    process.chdir(anchor.previousCwd);
  } finally {
    closeSync3(anchor.descriptor);
  }
}
function atomicCheckpointWrite(content, now) {
  const temporary = `.checkpoint-${String(process.pid)}-${String(now)}.tmp`;
  let descriptor;
  let owned;
  let renamed = false;
  try {
    descriptor = openSync3(
      temporary,
      constants3.O_WRONLY | constants3.O_CREAT | constants3.O_EXCL | (constants3.O_NOFOLLOW ?? 0),
      384
    );
    const opened = fstatSync2(descriptor);
    owned = { dev: opened.dev, ino: opened.ino };
    const bytes = Buffer.from(content, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (written <= 0) return false;
      offset += written;
    }
    closeSync3(descriptor);
    descriptor = void 0;
    renameSync3(temporary, "checkpoint.md");
    renamed = true;
    return true;
  } catch {
    return false;
  } finally {
    if (descriptor !== void 0) closeSync3(descriptor);
    if (!renamed && owned !== void 0) {
      try {
        const current = lstatSync4(temporary);
        if (!current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino) {
          unlinkSync(temporary);
        }
      } catch {
      }
    }
  }
}
function mutateCheckpoint(root, now, decide) {
  const anchor = anchorMachineDirectory(root);
  if (anchor === void 0) {
    return { status: "degraded", details: { reason: "unsafe-checkpoint-path" } };
  }
  try {
    const lockPath = "checkpoint.md.lock";
    const lock = acquireLock(lockPath, now);
    if (lock === void 0) {
      return { status: "skipped", details: { reason: "checkpoint-lock-or-write-failed" } };
    }
    try {
      const raw = rawCheckpoint("checkpoint.md");
      if (raw === void 0) {
        return { status: "degraded", details: { reason: "checkpoint-unreadable" } };
      }
      const mutation = decide(raw);
      if (mutation.content === void 0) return mutation.execution;
      if (!atomicCheckpointWrite(mutation.content, now)) {
        return { status: "skipped", details: { reason: "checkpoint-lock-or-write-failed" } };
      }
      return mutation.execution;
    } finally {
      releaseLock(lockPath, lock);
    }
  } finally {
    releaseMachineDirectory(anchor);
  }
}
function canonicalDirectory(path) {
  try {
    const info = lstatSync4(path);
    if (!info.isDirectory() || info.isSymbolicLink()) return void 0;
    const canonical2 = realpathSync4(path);
    return canonical2 === resolve6(path) ? canonical2 : void 0;
  } catch {
    return void 0;
  }
}
function encodedClaudeProject(root) {
  return root.replace(/[^a-zA-Z0-9]/g, "-");
}
function transcriptRoots(root, runtime3) {
  const canonicalRoot = realpathSync4(resolve6(root));
  const candidates = [canonicalRoot];
  if (runtime3 === "claude") {
    candidates.push(
      join11(homedir(), ".claude", "projects", encodedClaudeProject(canonicalRoot))
    );
  }
  return candidates.map(canonicalDirectory).filter((path) => path !== void 0);
}
function runtimeSessionId(input) {
  const value = input["session_id"] ?? input["sessionId"] ?? input["thread_id"] ?? input["threadId"];
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(value) ? value : void 0;
}
function isExternalTranscriptBound(path, runtime3, sessionId) {
  return runtime3 === "claude" && /^[A-Za-z0-9_-]{8,200}$/.test(sessionId) && basename3(path) === `${sessionId}.jsonl`;
}
function openBoundedRegularFile(path, maxBytes, allowedRoots) {
  let descriptor;
  try {
    const before = lstatSync4(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) return void 0;
    const canonicalPath = realpathSync4(path);
    if (!allowedRoots.some((root) => within(root, canonicalPath))) return void 0;
    descriptor = openSync3(
      path,
      constants3.O_RDONLY | constants3.O_NONBLOCK | (constants3.O_NOFOLLOW ?? 0)
    );
    const opened = fstatSync2(descriptor);
    const currentPath = realpathSync4(path);
    const current = statSync4(currentPath);
    if (!opened.isFile() || opened.size > maxBytes || currentPath !== canonicalPath || opened.dev !== current.dev || opened.ino !== current.ino || !allowedRoots.some((root) => within(root, currentPath))) {
      closeSync3(descriptor);
      return void 0;
    }
    return { descriptor, canonicalPath, size: opened.size };
  } catch {
    if (descriptor !== void 0) closeSync3(descriptor);
    return void 0;
  }
}
function readBoundedDescriptor(descriptor, maxBytes) {
  const bytes = Buffer.alloc(maxBytes + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync3(descriptor, bytes, offset, bytes.length - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  return offset > maxBytes ? void 0 : bytes.subarray(0, offset).toString("utf8");
}
function finiteToken(value) {
  if (value === void 0) return 0;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function usageFromLine(line) {
  try {
    const parsed = record3(JSON.parse(line));
    const usage = record3(record3(parsed?.["message"])?.["usage"]);
    if (usage === void 0) return { status: "none" };
    const input = finiteToken(usage["input_tokens"]);
    const output = finiteToken(usage["output_tokens"]);
    const cacheRead = finiteToken(usage["cache_read_input_tokens"]);
    const cacheCreation = finiteToken(usage["cache_creation_input_tokens"]);
    return input === void 0 || output === void 0 || cacheRead === void 0 || cacheCreation === void 0 ? { status: "invalid" } : { status: "usage", usedTokens: input + output + cacheRead + cacheCreation };
  } catch {
    return { status: "invalid" };
  }
}
function observeTranscript(path, state, input, root, runtime3) {
  if (path === "" || path.length > 4096 || path.includes("\0") || !isAbsolute5(path)) {
    return void 0;
  }
  let descriptor;
  try {
    const roots = transcriptRoots(root, runtime3);
    const opened = openBoundedRegularFile(path, Number.MAX_SAFE_INTEGER, roots);
    if (opened === void 0) return void 0;
    descriptor = opened.descriptor;
    const canonicalRoot = realpathSync4(resolve6(root));
    if (!within(canonicalRoot, opened.canonicalPath)) {
      const sessionId = runtimeSessionId(input);
      if (sessionId === void 0 || !isExternalTranscriptBound(opened.canonicalPath, runtime3, sessionId)) {
        return void 0;
      }
    }
    const fingerprint = `sha256:${createHash2("sha256").update(opened.canonicalPath).digest("hex")}`;
    const sameTranscript = fingerprint === state.transcriptFingerprint;
    const previousCursor = sameTranscript && opened.size >= state.transcriptCursorBytes ? state.transcriptCursorBytes : 0;
    const available = Math.max(0, opened.size - previousCursor);
    if (available === 0) return void 0;
    const readStart = available > MAX_TRANSCRIPT_BYTES ? opened.size - MAX_TRANSCRIPT_BYTES : previousCursor;
    const requested = Math.min(MAX_TRANSCRIPT_BYTES, opened.size - readStart);
    const bytes = Buffer.alloc(requested);
    const bytesRead = readSync3(descriptor, bytes, 0, requested, readStart);
    const bounded = bytes.subarray(0, bytesRead);
    let contentStart = 0;
    let skippedBytes = Math.max(0, readStart - previousCursor);
    if (readStart > previousCursor) {
      const firstNewline = bounded.indexOf(10);
      if (firstNewline < 0) {
        return {
          fingerprint,
          cursorBytes: readStart + bytesRead,
          skippedBytes: skippedBytes + bytesRead,
          skippedLines: 1
        };
      }
      contentStart = firstNewline + 1;
      skippedBytes += contentStart;
    }
    const lastNewline = bounded.lastIndexOf(10);
    if (lastNewline < contentStart) {
      return {
        fingerprint,
        cursorBytes: previousCursor,
        skippedBytes,
        skippedLines: 0
      };
    }
    const complete = bounded.subarray(contentStart, lastNewline).toString("utf8");
    let usedTokens;
    let skippedLines = 0;
    for (const line of complete.split("\n")) {
      if (line.trim() === "") continue;
      const usage = usageFromLine(line);
      if (usage.status === "invalid") {
        skippedLines += 1;
      } else if (usage.status === "usage") {
        usedTokens = usage.usedTokens;
      }
    }
    return {
      fingerprint,
      cursorBytes: readStart + lastNewline + 1,
      ...usedTokens === void 0 ? {} : { usedTokens },
      skippedBytes,
      skippedLines
    };
  } catch {
    return void 0;
  } finally {
    if (descriptor !== void 0) closeSync3(descriptor);
  }
}
function contextConfig(root) {
  let descriptor;
  try {
    const canonicalRoot = realpathSync4(resolve6(root));
    const opened = openBoundedRegularFile(
      join11(canonicalRoot, ".void", "config.json"),
      MAX_CONFIG_BYTES,
      [canonicalRoot]
    );
    if (opened === void 0) return void 0;
    descriptor = opened.descriptor;
    const raw = readBoundedDescriptor(descriptor, MAX_CONFIG_BYTES);
    return raw === void 0 ? void 0 : JSON.parse(raw);
  } catch {
    return void 0;
  } finally {
    if (descriptor !== void 0) closeSync3(descriptor);
  }
}
function thresholdConfig(root) {
  const config = record3(contextConfig(root));
  const context = record3(config?.["context"]);
  const window = context?.["windowTokens"];
  const threshold = context?.["checkpointThresholdPercent"];
  const windowTokens = Number.isSafeInteger(window) && Number(window) > 0 ? Number(window) : void 0;
  const thresholdPercent = threshold === void 0 ? 50 : Number.isSafeInteger(threshold) && Number(threshold) >= 40 && Number(threshold) <= 60 ? Number(threshold) : 0;
  return {
    ...windowTokens === void 0 ? {} : { windowTokens },
    thresholdPercent
  };
}
function measureContext(state, input, root, event, runtime3, now) {
  if (event === "PostToolUse" && now - state.lastMeasurementAtMs < POST_TOOL_MEASUREMENT_COOLDOWN_MS) {
    return { state, emitNudge: false, skippedBytes: 0, skippedLines: 0 };
  }
  const path = input["transcript_path"];
  if (typeof path !== "string") {
    return { state, emitNudge: false, skippedBytes: 0, skippedLines: 0 };
  }
  const observed = observeTranscript(path, state, input, root, runtime3);
  if (observed === void 0) {
    return { state, emitNudge: false, skippedBytes: 0, skippedLines: 0 };
  }
  const cursorState = observed.fingerprint === state.transcriptFingerprint && observed.cursorBytes === state.transcriptCursorBytes ? state : {
    ...state,
    transcriptFingerprint: observed.fingerprint,
    transcriptCursorBytes: observed.cursorBytes
  };
  if (observed.usedTokens === void 0) {
    return {
      state: cursorState,
      emitNudge: false,
      skippedBytes: observed.skippedBytes,
      skippedLines: observed.skippedLines
    };
  }
  const config = thresholdConfig(root);
  const decision = evaluateContextMeasurement(cursorState, {
    usedTokens: observed.usedTokens,
    measuredAtMs: now,
    thresholdPercent: config.thresholdPercent,
    ...config.windowTokens === void 0 ? {} : { windowTokens: config.windowTokens }
  });
  return {
    state: decision.state,
    emitNudge: decision.emitNudge,
    ...decision.usagePercent === void 0 ? {} : { usagePercent: decision.usagePercent },
    ...decision.unjudgeable === void 0 ? {} : { unjudgeable: decision.unjudgeable },
    skippedBytes: observed.skippedBytes,
    skippedLines: observed.skippedLines
  };
}
function unwatchableOutput(event, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: reason === "window-unknown" ? "Context usage is being recorded but cannot be watched: no `context.windowTokens` is configured in `.void/config.json`, so no percentage and no checkpoint threshold can be computed. Set it to the model context window to enable the reminder." : "Context usage is being recorded but the checkpoint threshold cannot be applied: `context.checkpointThresholdPercent` in `.void/config.json` is outside the accepted 40 to 60 range, which disarms the reminder entirely. Set it within that range, or remove it to take the default of 50."
    }
  };
}
function nudgeOutput(event, thresholdPercent) {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: `Context usage reached the configured ${String(thresholdPercent)}% checkpoint threshold. Invoke \`void-checkpoint\` before continuing a long branch of work.`
    }
  };
}
function sealPreCompact(input, root, runtime3, now) {
  return mutateCheckpoint(root, now, (raw) => {
    const block2 = parseMechanicalContextBlock(raw);
    if (block2.status === "invalid") {
      return {
        execution: {
          status: "degraded",
          details: { reason: "mechanical-block-ambiguous" }
        }
      };
    }
    const current = block2.status === "valid" ? block2.state : initialState(raw);
    const advanced = advanceMechanicalContext(current, {
      objectiveHash: hashCheckpointObjective(parseCheckpoint(raw).objective)
    });
    const measurement = measureContext(advanced, input, root, "PreCompact", runtime3, now);
    const sealed = advanceMechanicalContext(measurement.state, { compactionSealed: true });
    const merged = mergeMechanicalContextBlock(raw, sealed);
    if (!merged.ok) {
      return {
        execution: { status: "degraded", details: { reason: merged.error } }
      };
    }
    return {
      content: merged.value,
      execution: {
        status: "ok",
        details: {
          sealed: true,
          transcriptSkippedBytes: measurement.skippedBytes,
          transcriptSkippedLines: measurement.skippedLines
        }
      }
    };
  });
}
function successfulToolUse(input) {
  const response = record3(input["tool_response"]) ?? record3(input["tool_result"]);
  if (response?.["is_error"] === true || response?.["success"] === false) return false;
  return input["error"] === void 0 && input["tool_error"] === void 0;
}
function boundedProjectPath(root, candidate) {
  if (candidate === "" || candidate.length > 500 || candidate.includes(MECHANICAL_BEGIN2) || candidate.includes(MECHANICAL_END2) || [...candidate].some((character) => character.charCodeAt(0) < 32)) return void 0;
  const target = isAbsolute5(candidate) ? resolve6(candidate) : resolve6(root, candidate);
  const local = relative4(resolve6(root), target);
  if (local === "" || local.startsWith("..") || isAbsolute5(local)) return void 0;
  return local.split("\\").join("/");
}
function toolPaths(call, root) {
  const isModification = call.tool === "Edit" || call.tool === "Write" || call.tool === "apply_patch";
  const isRead = call.tool === "Read" || call.tool === "read_file" || call.tool === "view_image";
  if (!isModification && !isRead) return { readFiles: [], modifiedFiles: [] };
  const paths = call.edits.map((edit) => boundedProjectPath(root, edit.path)).filter((path) => path !== void 0 && path !== CHECKPOINT);
  return isRead ? { readFiles: paths, modifiedFiles: [] } : { readFiles: [], modifiedFiles: paths };
}
function evolveCheckpoint(root, now, runtime3, observation, input, event) {
  return mutateCheckpoint(root, now, (raw) => {
    const block2 = parseMechanicalContextBlock(raw);
    if (block2.status === "invalid") {
      return {
        execution: {
          status: "degraded",
          details: { reason: "mechanical-block-ambiguous" }
        }
      };
    }
    const current = block2.status === "valid" ? block2.state : initialState(raw);
    const reconcile = observation.semanticCheckpointWritten === true;
    const advanced = advanceMechanicalContext(current, {
      ...observation,
      ...reconcile ? { objectiveHash: hashCheckpointObjective(parseCheckpoint(raw).objective) } : {},
      semanticCheckpointWritten: false
    });
    const measurement = input === void 0 || event === void 0 ? { state: advanced, emitNudge: false, skippedBytes: 0, skippedLines: 0 } : measureContext(advanced, input, root, event, runtime3, now);
    const measured = reconcile ? advanceMechanicalContext(measurement.state, { semanticCheckpointWritten: true }) : measurement.state;
    const unjudgeable = measurement.unjudgeable ?? (thresholdConfig(root).windowTokens === void 0 ? "window-unknown" : void 0);
    const unwatchable = unjudgeable !== void 0 && !measured.unwatchableNotified && event !== void 0;
    const next = unwatchable ? { ...measured, unwatchableNotified: true } : measured;
    if (next === current && block2.status === "valid") {
      return {
        execution: { status: "skipped", details: { reason: "duplicate-observation" } }
      };
    }
    const merged = mergeMechanicalContextBlock(raw, next);
    if (!merged.ok) {
      return { execution: { status: "degraded", details: { reason: merged.error } } };
    }
    return {
      content: merged.value,
      execution: {
        status: "ok",
        details: {
          advanced: next.workRevision !== current.workRevision,
          transcriptSkippedBytes: measurement.skippedBytes,
          transcriptSkippedLines: measurement.skippedLines
        },
        ...measurement.emitNudge && event !== void 0 ? { output: nudgeOutput(event, thresholdConfig(root).thresholdPercent) } : unwatchable && event !== void 0 && unjudgeable !== void 0 ? { output: unwatchableOutput(event, unjudgeable) } : {}
      }
    };
  });
}
function observePostToolUse(input, root, runtime3, now) {
  if (!successfulToolUse(input)) {
    return { status: "skipped", details: { reason: "tool-use-failed" } };
  }
  try {
    const call = normalizeToolCall(input);
    const paths = toolPaths(call, root);
    const checkpointWrite = (call.tool === "Edit" || call.tool === "Write" || call.tool === "apply_patch") && call.edits.some(
      (edit) => boundedProjectPath(root, edit.path) === CHECKPOINT
    );
    return evolveCheckpoint(root, now, runtime3, {
      readFiles: paths.readFiles,
      modifiedFiles: paths.modifiedFiles,
      ...checkpointWrite ? { semanticCheckpointWritten: true } : {}
    }, checkpointWrite ? void 0 : input, checkpointWrite ? void 0 : "PostToolUse");
  } catch {
    return { status: "degraded", details: { reason: "invalid-tool-input" } };
  }
}
function executeContextContinuity(rawInput, root, runtime3, now) {
  const projectRoot2 = resolve6(root);
  const input = record3(rawInput);
  if (input === void 0) {
    return { status: "degraded", details: { reason: "invalid-hook-input" } };
  }
  const event = input["hook_event_name"];
  if (event === "PreCompact") return sealPreCompact(input, projectRoot2, runtime3, now);
  if (event === "PostToolUse") return observePostToolUse(input, projectRoot2, runtime3, now);
  if (event === "UserPromptSubmit") {
    return evolveCheckpoint(projectRoot2, now, runtime3, {}, input, "UserPromptSubmit");
  }
  if (event === "SessionStart") {
    const source2 = input["source"];
    if (source2 === "startup" || source2 === "resume" || source2 === "clear" || source2 === "compact" || source2 === "fork") {
      return evolveCheckpoint(projectRoot2, now, runtime3, { resumeSource: source2 });
    }
  }
  return { status: "skipped", details: { reason: "event-not-actionable" } };
}

import { join as join12 } from "node:path";
var VERSION_SHAPE = /^[0-9A-Za-z.+-]{1,64}$/;
function readVersion(path) {
  const version = record3(readJson(path))?.["version"];
  return typeof version === "string" && VERSION_SHAPE.test(version) ? version : void 0;
}
function resolveInstall(root, env) {
  const explicit = env["VOID_HARNESS_VERSION"];
  if (explicit !== void 0 && VERSION_SHAPE.test(explicit)) {
    return { version: explicit, source: void 0 };
  }
  const pluginRoot = env["CLAUDE_PLUGIN_ROOT"];
  if (pluginRoot !== void 0) {
    const version2 = readVersion(join12(pluginRoot, ".claude-plugin", "plugin.json"));
    if (version2 !== void 0) return { version: version2, source: "marketplace" };
  }
  const receipt = record3(readJson(voidReadPath(root, "receipts", "install-v1.json")));
  const version = receipt?.["version"];
  if (typeof version === "string" && VERSION_SHAPE.test(version)) {
    const declared = receipt?.["source"];
    const source2 = declared === "local" || declared === "marketplace" ? declared : void 0;
    return { version, source: source2 };
  }
  return { version: "unknown", source: void 0 };
}

import { spawnSync as spawnSync3 } from "node:child_process";

import {
  isAbsolute as isAbsolute6,
  relative as relative5,
  resolve as resolve7
} from "node:path";
var FORMATTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/;
function within2(root, target) {
  const rel = relative5(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute6(rel);
}
function formatCandidates(touchedPaths, projectRoot2) {
  const root = resolve7(projectRoot2);
  const found = /* @__PURE__ */ new Set();
  for (const touchedPath of touchedPaths) {
    const target = resolve7(root, touchedPath);
    if (touchedPath.trim() !== "" && FORMATTABLE.test(touchedPath.replaceAll("\\", "/")) && within2(root, target)) {
      found.add(target);
    }
  }
  return [...found];
}

function executeFormat(rawInput, root, env) {
  const call = normalizeToolCall(rawInput);
  if (call.tool !== "Edit" && call.tool !== "Write" && call.tool !== "apply_patch") {
    return { status: "skipped", details: { reason: "tool-not-applicable" } };
  }
  const files = safeExistingFiles(
    formatCandidates(call.edits.map((edit) => edit.path), root),
    root
  );
  if (files.length === 0) {
    return { status: "skipped", details: { reason: "no-formattable-touched-file" } };
  }
  const biome = findExecutable("biome", root, env);
  if (biome === void 0) {
    return { status: "skipped", details: { reason: "formatter-unavailable" } };
  }
  const timeout = boundedInteger(
    env["VOID_HARNESS_FORMAT_TIMEOUT_MS"],
    1e4,
    100,
    3e4
  );
  let formatted = 0;
  for (const file of files) {
    const result = spawnSync3(biome, ["format", "--write", file], {
      cwd: root,
      env: { ...process.env, ...env },
      shell: false,
      stdio: "ignore",
      timeout
    });
    if (result.error !== void 0 || result.status !== 0) {
      const timedOut = result.error?.message.includes("ETIMEDOUT") ?? false;
      return {
        status: "degraded",
        details: {
          reason: timedOut ? "timeout" : "formatter-error",
          formatted,
          timeoutMs: timeout
        }
      };
    }
    formatted += 1;
  }
  return { status: "ok", details: { formatted } };
}

import { spawnSync as spawnSync4 } from "node:child_process";

function parseAddedLines(numstat) {
  return numstat.split(/\r?\n/).reduce((total, line) => {
    const [added] = line.split("	", 1);
    const count = Number(added);
    if (!Number.isSafeInteger(count) || count < 0) return total;
    return Math.min(Number.MAX_SAFE_INTEGER, total + count);
  }, 0);
}
function hasLargeChangeJustification(text2) {
  return /^\s*large-cl-justification\s*:\s*\S.*$/imu.test(text2);
}
function assessLargeChange(assessment) {
  if (assessment.addedLines <= assessment.threshold || assessment.justified) {
    return allow();
  }
  return {
    allow: true,
    code: "LARGE_CHANGE_WARNING",
    message: `change adds ${assessment.addedLines} lines (threshold ${assessment.threshold}); split it or justify why it is atomic`,
    evidence: ["large-cl-justification: <reason>"]
  };
}

function runGit(git3, root, args, env) {
  const result = spawnSync4(git3, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: false,
    timeout: 5e3,
    maxBuffer: 2 * 1024 * 1024
  });
  return {
    ok: result.status === 0,
    output: result.status === 0 ? result.stdout.trim() : ""
  };
}
function verifiedRef(git3, root, ref, env) {
  if (ref === "" || ref.includes("\r") || ref.includes("\n") || ref.includes("\0")) return false;
  return runGit(
    git3,
    root,
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    env
  ).ok;
}
function baseRef(git3, root, env) {
  const configured = env["VOID_HARNESS_BASE_REF"]?.trim();
  if (configured !== void 0 && configured !== "") {
    return verifiedRef(git3, root, configured, env) ? configured : void 0;
  }
  const upstream = runGit(
    git3,
    root,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    env
  );
  const candidates = [
    upstream.ok ? upstream.output : "",
    "origin/main",
    "origin/master",
    "main",
    "master"
  ];
  return candidates.find((candidate) => verifiedRef(git3, root, candidate, env));
}
function executeLargeChange(root, env) {
  const git3 = findExecutable("git", root, env);
  if (git3 === void 0) {
    return { status: "skipped", details: { reason: "git-unavailable" } };
  }
  const base = baseRef(git3, root, env);
  if (base === void 0) {
    const configuredBase = env["VOID_HARNESS_BASE_REF"]?.trim();
    return {
      status: "skipped",
      details: {
        reason: configuredBase === void 0 || configuredBase === "" ? "base-ref-unavailable" : "configured-base-ref-invalid"
      }
    };
  }
  const mergeBase = runGit(git3, root, ["merge-base", "HEAD", base], env);
  if (!mergeBase.ok) {
    return { status: "degraded", details: { reason: "merge-base-failed" } };
  }
  const range = `${mergeBase.output}..HEAD`;
  const diff = runGit(
    git3,
    root,
    ["diff", "--numstat", "--no-renames", range, "--"],
    env
  );
  const messages = runGit(git3, root, ["log", "--format=%B", range, "--"], env);
  if (!diff.ok || !messages.ok) {
    return { status: "degraded", details: { reason: "change-query-failed" } };
  }
  const threshold = boundedInteger(
    env["VOID_HARNESS_LARGE_CHANGE_THRESHOLD"] ?? env["VOIDCORP_LARGE_CL_THRESHOLD"],
    400,
    1,
    1e6
  );
  const addedLines = parseAddedLines(diff.output);
  const justified = hasLargeChangeJustification(messages.output);
  const verdict = assessLargeChange({ addedLines, threshold, justified });
  const details = {
    baseRef: base,
    addedLines,
    threshold,
    justified,
    code: verdict.code
  };
  if (verdict.code === "ALLOW") return { status: "ok", details };
  return {
    status: "degraded",
    details,
    diagnostic: `${verdict.code}: ${verdict.message}
- ${verdict.evidence.join("\n- ")}
`
  };
}

import { execFileSync } from "node:child_process";
import {
  existsSync as existsSync7,
  lstatSync as lstatSync5,
  readFileSync as readFileSync10,
  statSync as statSync5
} from "node:fs";
import { basename as basename4, join as join13 } from "node:path";
var PROGRAM_PATHS = [
  join13(".void", "program.md"),
  join13(".void", "active.md"),
  join13("plans", "ACTIVE.md")
];
var CHECKPOINT_PATHS = [
  join13(".void", "machine", "checkpoint.md"),
  join13(".void", "local", "checkpoint.md"),
  join13(".void", "session", "current.md")
];
var MAX_READ_BYTES = 5e5;
var GIT_TIMEOUT_MS2 = 200;
function readBounded(path) {
  try {
    const info = lstatSync5(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_READ_BYTES) return void 0;
    return readFileSync10(path, "utf8");
  } catch {
    return void 0;
  }
}
function frontmatter(raw) {
  return /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1];
}
function cleanScalar(value) {
  if (value === void 0) return void 0;
  const clean2 = value.trim().replace(/^['"]|['"]$/g, "");
  return clean2 === "" ? void 0 : clean2;
}
function rootScalar(block2, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanScalar(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "m").exec(block2)?.[1]);
}
function nestedBlock(block2, key) {
  const lines = block2.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:` && /^\S/.test(line));
  if (start < 0) return void 0;
  const nested = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    nested.push(line.replace(/^ {2}/, ""));
  }
  return nested.join("\n");
}
function programFrom(raw, legacy) {
  const block2 = frontmatter(raw);
  if (block2 === void 0) return void 0;
  if (!legacy && rootScalar(block2, "schemaVersion") !== "1") return void 0;
  const status = rootScalar(block2, "status");
  const program = rootScalar(block2, "program");
  const plan = rootScalar(block2, "plan");
  const spec = rootScalar(block2, "spec");
  if (status !== "executing" && status !== "completed" || program === void 0 || plan === void 0 || spec === void 0) {
    return void 0;
  }
  const progressBlock = nestedBlock(block2, legacy ? "tracker" : "progress");
  const provider = progressBlock === void 0 ? void 0 : rootScalar(progressBlock, "provider");
  const scope = progressBlock === void 0 ? void 0 : rootScalar(progressBlock, "scope");
  return {
    status,
    program,
    plan,
    spec,
    ...provider === void 0 || scope === void 0 ? {} : { progress: { provider, scope } }
  };
}
function observeProgram(root) {
  const present = PROGRAM_PATHS.filter((relative11) => existsSync7(join13(root, relative11)));
  if (present.length === 0) return { program: void 0 };
  if (present.length > 1) {
    return {
      program: void 0,
      programError: `multiple program descriptors: ${present.join(", ")}`
    };
  }
  const relative10 = present[0];
  if (relative10 === void 0) return { program: void 0 };
  const raw = readBounded(join13(root, relative10));
  const program = raw === void 0 ? void 0 : programFrom(raw, relative10 !== PROGRAM_PATHS[0]);
  return program === void 0 ? { program: void 0, programError: `invalid program descriptor: ${relative10}` } : { program };
}
function git2(root, args) {
  try {
    return execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS2,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return void 0;
  }
}
function gitObservation(root) {
  const branch = git2(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git2(root, ["rev-parse", "HEAD"]);
  const dirty = git2(root, ["status", "--porcelain"]);
  return {
    branch: branch === "HEAD" ? void 0 : branch,
    head,
    dirtyFiles: dirty === void 0 || dirty === "" ? 0 : dirty.split(/\r?\n/).length
  };
}
function checkpointObservation(root) {
  for (const relative10 of CHECKPOINT_PATHS) {
    const path = join13(root, relative10);
    const raw = readBounded(path);
    if (raw === void 0) continue;
    try {
      return { checkpoint: parseCheckpoint(raw), checkpointWrittenAt: statSync5(path).mtimeMs };
    } catch {
      return { checkpoint: parseCheckpoint(raw) };
    }
  }
  return {};
}
function observeResume(root, now, options = {}) {
  const checkpoint = checkpointObservation(root);
  const bundle = composeResumeBundle({
    project: { name: basename4(root), path: root },
    now,
    git: gitObservation(root),
    ...observeProgram(root),
    checkpoint: checkpoint.checkpoint,
    ...checkpoint.checkpointWrittenAt === void 0 ? {} : { checkpointWrittenAt: checkpoint.checkpointWrittenAt },
    ...options.source === void 0 ? {} : { resumeSource: options.source }
  });
  return {
    bundle,
    context: renderResumeContext(bundle),
    ...checkpoint.checkpointWrittenAt === void 0 ? {} : { checkpointWrittenAt: checkpoint.checkpointWrittenAt }
  };
}

var MAX_PROMPT_CHARS = 8e3;
function searchablePrompt(prompt) {
  return prompt.slice(0, MAX_PROMPT_CHARS).normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "").toLowerCase().replace(/[’'_-]/g, " ").replace(/\s+/g, " ").trim();
}
var NEGATED_CLOSE = [
  /\b(?:do not|don t|dont|never) stop here\b/,
  /\bne (?:nous )?arretons? pas ici\b/
];
var EXPLICIT_CLOSE = [
  /\bon s arrete ici\b/,
  /\bon reprend (?:demain|plus tard)\b/,
  /\bje reprends? demain\b/,
  /\bfin de journee\b/,
  /\bstop here(?: for today)?\b/,
  /\b(?:let us |we will )?resume tomorrow\b/,
  /\b(?:fais|faire|make|create|write) (?:un |a )?checkpoint\b/,
  /\bcheckpoint\b.*\b(?:end|close|finish|finir|termine?r?)\b.*\b(?:session|journee|today)\b/,
  /\b(?:end|close) the session\b/
];
function detectsSessionCloseIntent(prompt) {
  const searchable = searchablePrompt(prompt);
  if (NEGATED_CLOSE.some((pattern) => pattern.test(searchable))) return false;
  return EXPLICIT_CLOSE.some((pattern) => pattern.test(searchable));
}
function checkpointReminderOutput(prompt) {
  if (!detectsSessionCloseIntent(prompt)) return void 0;
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "Explicit session-close intent detected. Invoke `void-checkpoint` before the closing response. Route durable facts to their owner, show any shared write before applying it, and do not mark the current work unit complete merely because the session ends."
    }
  };
}

import { createHash as createHash3 } from "node:crypto";
import {
  lstatSync as lstatSync6,
  mkdirSync as mkdirSync4,
  realpathSync as realpathSync5,
  writeFileSync as writeFileSync3
} from "node:fs";
import { join as join14, relative as relative6 } from "node:path";

function record4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function contentText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    const block2 = record4(item);
    return typeof block2?.["text"] === "string" ? block2["text"] : "";
  }).filter((item) => item !== "").join("\n");
}
function responseText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return contentText(value);
  const response = record4(value);
  if (response === void 0) return "";
  return [
    response["stdout"],
    response["stderr"],
    response["output"],
    response["result"],
    contentText(response["content"])
  ].filter((item) => typeof item === "string" && item !== "").join("\n");
}
function extractToolOutput(value) {
  const raw = record4(value);
  if (raw === void 0) return void 0;
  const tool = raw["tool_name"];
  if (typeof tool !== "string" || tool !== "Bash" && tool !== "shell" && !tool.startsWith("mcp__")) {
    return void 0;
  }
  const text2 = responseText(raw["tool_response"]);
  return text2 === "" ? void 0 : { tool, text: text2 };
}
function errorEvidence(text2) {
  return text2.split(/\r?\n/).filter(
    (line) => /error|fail|exception|traceback|fatal|panic|not ok|assert/i.test(line)
  ).join("\n").slice(0, 1500);
}
function planOutputTrim(text2, options) {
  const originalBytes = Buffer.byteLength(text2, "utf8");
  if (originalBytes <= options.thresholdBytes) return void 0;
  const head = text2.slice(0, 3e3);
  const tail = text2.slice(-3e3);
  const errors = errorEvidence(text2);
  const updatedToolOutput = `${head}

[trimmed ${originalBytes} bytes. Full output: ${options.spillPath}]

${tail}

[error-like lines]
${errors}
`;
  return {
    fullOutput: text2,
    originalBytes,
    updatedToolOutput,
    note: `trim-large-output: ${options.tool} result ${originalBytes}B trimmed; full output at ${options.spillPath}`
  };
}

function safeOutputDirectory(root) {
  try {
    const canonicalRoot = realpathSync5(root);
    const directory = voidMachinePath(root, "outputs");
    mkdirSync4(directory, { recursive: true, mode: 448 });
    const info = lstatSync6(directory);
    const canonicalDirectory2 = realpathSync5(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || !within(canonicalRoot, canonicalDirectory2)) {
      return void 0;
    }
    return canonicalDirectory2;
  } catch {
    return void 0;
  }
}
function executeTrim(rawInput, root, env) {
  if (env["VOID_HARNESS_NO_TRIM"] === "1") {
    return { status: "skipped", details: { reason: "disabled" } };
  }
  const extracted = extractToolOutput(rawInput);
  if (extracted === void 0) {
    return { status: "skipped", details: { reason: "output-not-applicable" } };
  }
  const thresholdBytes = boundedInteger(
    env["VOID_HARNESS_TRIM_BYTES"],
    12e3,
    1,
    10 * 1024 * 1024
  );
  if (Buffer.byteLength(extracted.text, "utf8") <= thresholdBytes) {
    return { status: "skipped", details: { reason: "below-threshold" } };
  }
  const directory = safeOutputDirectory(root);
  if (directory === void 0) {
    return {
      status: "degraded",
      details: { reason: "unsafe-output-directory" }
    };
  }
  const hash = createHash3("sha256").update(extracted.text).digest("hex").slice(0, 12);
  const tool = extracted.tool.replaceAll(/[^A-Za-z0-9_]/g, "_").slice(0, 80);
  const file = join14(directory, `${tool}-${process.pid}-${Date.now()}-${hash}.log`);
  const spillPath = relative6(realpathSync5(root), file).replaceAll("\\", "/");
  const plan = planOutputTrim(extracted.text, {
    tool: extracted.tool,
    thresholdBytes,
    spillPath
  });
  if (plan === void 0) {
    return { status: "skipped", details: { reason: "below-threshold" } };
  }
  try {
    writeFileSync3(file, plan.fullOutput, {
      encoding: "utf8",
      flag: "wx",
      mode: 384
    });
  } catch {
    return { status: "degraded", details: { reason: "spill-write-failed" } };
  }
  return {
    status: "ok",
    details: {
      originalBytes: plan.originalBytes,
      spillPath
    },
    output: {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: plan.updatedToolOutput,
        additionalContext: plan.note
      }
    }
  };
}

import { existsSync as existsSync8 } from "node:fs";
import { join as join16 } from "node:path";
import { spawnSync as spawnSync5 } from "node:child_process";

import {
  dirname as dirname6,
  isAbsolute as isAbsolute7,
  join as join15,
  relative as relative7,
  resolve as resolve8
} from "node:path";
function record5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
var AMBIENT_KEPT = /* @__PURE__ */ new Set([
  "PATH",
  "Path",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "SystemRoot",
  "windir",
  "COMSPEC",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "SHELL",
  "USER",
  "LOGNAME"
]);
function minimalEnvironment(ambient, passed) {
  const kept = {};
  for (const [name, value] of Object.entries(ambient)) {
    if (value !== void 0 && AMBIENT_KEPT.has(name)) kept[name] = value;
  }
  for (const [name, value] of Object.entries(passed)) {
    if (value !== void 0) kept[name] = value;
  }
  return kept;
}
var LAUNCHERS = {
  pnpm: ["exec", "dlx"],
  npm: ["exec"],
  yarn: ["exec", "dlx"],
  bun: ["x"],
  // Runners that take the binary directly, with no subcommand.
  npx: [],
  bunx: [],
  pnpx: []
};
var CHECKERS = /* @__PURE__ */ new Set(["tsc", "vue-tsc", "svelte-check", "astro", "tsgo"]);
function argumentIsSafe(argument) {
  if (argument.startsWith("-")) return /^-{1,2}[A-Za-z][\w-]*$/.test(argument);
  return /^[\w./-]+$/.test(argument) && !argument.startsWith("/") && !argument.includes("..");
}
function acceptableTypecheck(argv) {
  const [head, ...rest] = argv;
  if (head === void 0) return "empty command";
  if (head.includes("/") || head.includes("\\")) return `path-qualified executable ${head}`;
  let checkerIndex = 0;
  if (Object.hasOwn(LAUNCHERS, head)) {
    const subcommands = LAUNCHERS[head] ?? [];
    if (subcommands.length > 0) {
      const subcommand = rest[0];
      if (subcommand === void 0 || !subcommands.includes(subcommand)) {
        return `${head} must be followed by ${subcommands.join(" or ")}, not ${String(subcommand)}`;
      }
      checkerIndex = 1;
    }
  } else if (CHECKERS.has(head)) {
    return rest.every(argumentIsSafe) ? void 0 : "argument that is not a flag or a path";
  } else {
    return `unknown executable ${head}`;
  }
  const checker = rest[checkerIndex];
  if (checker === void 0 || !CHECKERS.has(checker)) return `unknown type checker ${String(checker)}`;
  return rest.slice(checkerIndex + 1).every(argumentIsSafe) ? void 0 : "argument that is not a flag or a path";
}
function configuredTypecheck(value) {
  const root = record5(value);
  const commands = record5(root?.["commands"]);
  const configured = commands?.["typecheck"];
  if (Array.isArray(configured) && configured.length > 0 && configured.every((argument) => typeof argument === "string")) {
    const refusal = acceptableTypecheck(configured);
    return refusal === void 0 ? { argv: configured } : { warning: `commands.typecheck refused (${refusal}); falling back to the resolved type checker` };
  }
  if (typeof configured === "string") {
    return {
      warning: "legacy commands.typecheck string ignored; migrate it to argv"
    };
  }
  return {};
}
function within3(root, target) {
  const rel = relative7(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute7(rel);
}
function nearestTsconfigs(changedPaths, projectRoot2, hasFile) {
  const root = resolve8(projectRoot2);
  const found = /* @__PURE__ */ new Set();
  for (const changedPath of changedPaths) {
    if (!/\.(?:ts|tsx)$/.test(changedPath) || changedPath.endsWith(".d.ts")) continue;
    const target = resolve8(root, changedPath);
    if (!within3(root, target)) continue;
    let current = dirname6(target);
    while (within3(root, current)) {
      const config = join15(current, "tsconfig.json");
      if (hasFile(config)) {
        found.add(config);
        break;
      }
      if (current === root) break;
      current = dirname6(current);
    }
  }
  return [...found];
}

function runGit2(root, args, env) {
  const git3 = findExecutable("git", root, env);
  if (git3 === void 0) return { ok: false, output: "" };
  const result = spawnSync5(git3, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: false,
    timeout: 5e3,
    maxBuffer: 1024 * 1024
  });
  return {
    ok: result.status === 0,
    output: result.status === 0 ? result.stdout : ""
  };
}
function changedTypeScript(root, env) {
  const head = runGit2(root, ["rev-parse", "--verify", "HEAD"], env);
  const tracked = head.ok ? runGit2(
    root,
    ["diff", "--name-only", "--diff-filter=ACM", "HEAD"],
    env
  ) : { ok: true, output: "" };
  const untracked = runGit2(
    root,
    ["ls-files", "--others", "--exclude-standard"],
    env
  );
  if (!tracked.ok || !untracked.ok) return void 0;
  return [...new Set(`${tracked.output}
${untracked.output}`.split(/\r?\n/))].filter((path) => /\.(?:ts|tsx)$/.test(path) && !path.endsWith(".d.ts"));
}
function typeErrors(output) {
  return output.split(/\r?\n/).filter((line) => /error TS\d+|error:/i.test(line)).slice(0, 20).join("\n").slice(0, 12e3);
}
function executeTypecheck(root, env) {
  const changed = changedTypeScript(root, env);
  if (changed === void 0) {
    return { status: "skipped", details: { reason: "non-git-or-git-unavailable" } };
  }
  if (changed.length === 0) {
    return { status: "skipped", details: { reason: "no-touched-typescript" } };
  }
  const configs = nearestTsconfigs(changed, root, existsSync8);
  const configured = configuredTypecheck(readJson(join16(root, ".void", "config.json")));
  const configuredArgv = "argv" in configured ? configured.argv : void 0;
  const warning = "warning" in configured ? configured.warning : void 0;
  const fallback = findExecutable("tsc", root, env);
  const argv = configuredArgv ?? (fallback === void 0 ? void 0 : [fallback, "--noEmit"]);
  if (argv === void 0) {
    return {
      status: "skipped",
      details: {
        reason: "typechecker-unavailable",
        ...warning === void 0 ? {} : { warning }
      },
      ...warning === void 0 ? {} : { diagnostic: `stop-typecheck: ${warning}
` }
    };
  }
  const executablePath = findExecutable(argv[0] ?? "", root, env);
  if (executablePath === void 0) {
    return {
      status: "degraded",
      details: { reason: "configured-executable-unavailable" }
    };
  }
  const timeout = boundedInteger(
    env["VOID_HARNESS_TYPECHECK_TIMEOUT_MS"],
    45e3,
    100,
    12e4
  );
  const args = argv.slice(1);
  const isTsc = argv.some(
    (argument) => /(?:^|[\\/])tsc(?:\.cmd|\.exe)?$/.test(argument)
  );
  const invocations = isTsc && configs.length > 0 ? configs.map((config) => [...args, "-p", config]) : [args];
  let errors = "";
  for (const invocation of invocations) {
    const result = spawnSync5(executablePath, invocation, {
      cwd: root,
      env: minimalEnvironment(process.env, env),
      encoding: "utf8",
      shell: false,
      timeout,
      maxBuffer: 1024 * 1024
    });
    if (result.error !== void 0) {
      const timedOut = result.error.message.includes("ETIMEDOUT");
      return {
        status: "degraded",
        details: {
          reason: timedOut ? "timeout" : "execution-error",
          timeoutMs: timeout
        },
        diagnostic: timedOut ? `stop-typecheck: typecheck exceeded ${timeout}ms; advisory result degraded.
` : "stop-typecheck: typecheck could not execute; advisory result degraded.\n"
      };
    }
    if (result.status !== 0) {
      errors += `${typeErrors(`${result.stdout}
${result.stderr}`)}
`;
    }
  }
  const bounded = errors.trim().slice(0, 12e3);
  if (bounded !== "") {
    return {
      status: "degraded",
      details: { reason: "type-errors", configs: invocations.length },
      diagnostic: `stop-typecheck (advisory): type errors in the touched TypeScript surface:
${bounded}
Resolve before claiming done. This never blocks.
`
    };
  }
  return {
    status: "ok",
    details: {
      checkedConfigs: invocations.length,
      ...warning === void 0 ? {} : { warning }
    },
    ...warning === void 0 ? {} : { diagnostic: `stop-typecheck: ${warning}
` }
  };
}

import { createHash as createHash4 } from "node:crypto";
import {
  basename as basename5,
  extname,
  isAbsolute as isAbsolute8,
  relative as relative8,
  resolve as resolve9
} from "node:path";
var MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;
function record6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function text(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  let clean2 = "";
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0;
    if (point >= 32 && point !== 127) clean2 += char;
    if (clean2.length >= 256) break;
  }
  return clean2.slice(0, 256);
}
function runtimeSession(raw) {
  return text(
    raw["session_id"] ?? raw["sessionId"] ?? raw["thread_id"] ?? raw["threadId"]
  );
}
function categoryFor(tool) {
  if (tool === "Skill") return "skill";
  if (tool === "Task" || tool === "Agent" || tool === "collaborationspawn_agent" || tool === "collaboration.spawn_agent") return "agent";
  if (tool === "Workflow") return "workflow";
  return "tool";
}
function nameFor(tool, category, input) {
  if (category === "skill") {
    return text(input["skill"] ?? input["name"], "unknown");
  }
  if (category === "agent") {
    return text(
      input["subagent_type"] ?? input["agent_type"] ?? input["agent"],
      tool === "Agent" ? "claude" : "unknown"
    );
  }
  if (category === "workflow") {
    const explicit = text(input["name"]);
    if (explicit !== "") return explicit;
    const script = text(input["scriptPath"]);
    return script === "" || script.endsWith("/") ? "inline" : basename5(script).replace(/(?:\.workflow)?\.js$/, "") || "inline";
  }
  return tool || "unknown";
}
function safePaths(input, root) {
  const absoluteRoot = resolve9(root);
  const candidates = [
    input["file_path"],
    input["path"],
    input["pattern"]
  ];
  const paths = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 2e3) continue;
    if (!isAbsolute8(candidate)) {
      if (!candidate.startsWith("..")) paths.push(candidate.slice(0, 500));
      continue;
    }
    const rel = relative8(absoluteRoot, resolve9(candidate));
    if (rel !== "" && !rel.startsWith("..") && !isAbsolute8(rel)) {
      paths.push(rel.slice(0, 500));
    }
  }
  return paths;
}
function outcomeStatus(raw) {
  const response = record6(raw["tool_response"]);
  if (response === void 0) return "unknown";
  if (response["success"] === false || response["is_error"] === true || response["error"] !== void 0) {
    return "error";
  }
  return "ok";
}
function adaptRuntimeInput(value, options) {
  const raw = record6(value);
  if (raw === void 0) return void 0;
  const runtimeSessionId2 = runtimeSession(raw);
  if (options.phase === "stop" || text(raw["hook_event_name"]) === "Stop") {
    return {
      runtimeSessionId: runtimeSessionId2,
      source: `runtime:${options.runtime}`,
      kind: "runtime.session.stopped",
      subject: `runtime:${options.runtime}`,
      payload: {}
    };
  }
  const tool = text(raw["tool_name"], "unknown");
  const input = record6(raw["tool_input"]) ?? {};
  const category = categoryFor(tool);
  const name = nameFor(tool, category, input);
  const fileGlobs = safePaths(input, options.root);
  const extensions = fileGlobs.map((path) => extname(path).slice(1)).filter((extension) => extension !== "");
  return {
    runtimeSessionId: runtimeSessionId2,
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
function deriveMissionId(explicit, runtime3, runtimeSessionId2, root) {
  if (explicit !== void 0 && explicit !== "") {
    if (!MISSION_ID.test(explicit)) {
      throw new Error("HOOK_INVALID_MISSION_ID: expected mis_<opaque-id>");
    }
    return explicit;
  }
  const opaque = createHash4("sha256").update(`${runtime3}\0${runtimeSessionId2 || "unknown"}\0${resolve9(root)}`).digest("hex").slice(0, 32);
  return `mis_${opaque}`;
}

import { randomUUID as nodeRandomUUID } from "node:crypto";
import {
  constants as constants4
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
  dirname as dirname7,
  isAbsolute as isAbsolute9,
  join as join17,
  relative as relative9,
  resolve as resolve10
} from "node:path";

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
    const code2 = char.codePointAt(0) ?? 0;
    bytes += code2 <= 127 ? 1 : code2 <= 2047 ? 2 : code2 <= 65535 ? 3 : 4;
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
function record7(value) {
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
  const object2 = record7(value);
  if (object2 === void 0)
    return false;
  return Object.entries(object2).every(([key, entry]) => key.length <= 100 && isPrintable(key) && isJsonValue(entry, depth + 1, budget));
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
  const raw = record7(value);
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

var MAX_EVENT_LOG_BYTES = 8 * 1024 * 1024;
var MISSION_ID3 = /^mis_[A-Za-z0-9_-]{8,100}$/;
var EVENT_ID2 = /^evt_[A-Za-z0-9_-]{8,100}$/;
var DEFAULT_LOCK_STALE_MS = 3e4;
var DEFAULT_LOCK_ATTEMPTS = 2e3;
var LOCK_RETRY_MS = 2;
function code(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function within4(root, target) {
  const rel = relative9(root, target);
  return rel === "" || !rel.startsWith("..") && !isAbsolute9(rel);
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
  const absoluteRoot = resolve10(root);
  const canonicalRoot = await realpath(absoluteRoot);
  const run = voidReadPath(absoluteRoot, "runs", missionId);
  let ancestor = run;
  while (!await exists(ancestor)) {
    const parent = dirname7(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const canonicalAncestor = await realpath(ancestor);
  if (!within4(canonicalRoot, canonicalAncestor)) {
    throw new Error("HOOK_PATH_ESCAPE: run directory resolves outside project");
  }
  await mkdir(run, { recursive: true, mode: 448 });
  const canonicalRun = await realpath(run);
  if (!within4(canonicalRoot, canonicalRun)) {
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
async function acquireLock2(path, staleMs, attempts) {
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
async function releaseLock2(lock) {
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
    constants4.O_APPEND | constants4.O_WRONLY | (constants4.O_NOFOLLOW ?? 0)
  );
  try {
    await append.writeFile("\n", "utf8");
  } finally {
    await append.close();
  }
  return logBytes + 1;
}
async function appendLine(logPath, line) {
  const flags = constants4.O_APPEND | constants4.O_CREAT | constants4.O_WRONLY | (constants4.O_NOFOLLOW ?? 0);
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
function sameDraft(event, options) {
  return event.missionId === options.missionId && event.source === options.draft.source && event.kind === options.draft.kind && event.subject === options.draft.subject && event.correlationId === options.draft.correlationId && event.causationId === options.draft.causationId && JSON.stringify(event.payload) === JSON.stringify(options.draft.payload);
}
async function existingIdempotentEvent(logPath, options, currentBytes) {
  if (options.eventId === void 0 || currentBytes === 0) return void 0;
  const stream = replayEventLog(await readFile(logPath, "utf8"));
  if (stream.continuity === "partial" || stream.duplicateEventIds > 0) {
    throw new Error("HOOK_EVENT_LOG_INTEGRITY: continuity cannot be proved");
  }
  const existing = stream.events.find((event) => event.eventId === options.eventId);
  if (existing !== void 0 && !sameDraft(existing, options)) {
    throw new Error("HOOK_EVENT_ID_CONFLICT: event ID belongs to another draft");
  }
  return existing;
}
async function currentCanonicalEvents(logPath, currentBytes) {
  if (currentBytes === 0) return [];
  const stream = replayEventLog(await readFile(logPath, "utf8"));
  if (stream.continuity === "partial" || stream.duplicateEventIds > 0) {
    throw new Error("HOOK_EVENT_LOG_INTEGRITY: continuity cannot be proved");
  }
  return stream.events;
}
async function writeSequencedEventInternal(options) {
  if (options.eventId !== void 0 && !EVENT_ID2.test(options.eventId)) {
    throw new Error("HOOK_INVALID_EVENT_ID: expected evt_<opaque-id>");
  }
  const run = await safeRunDirectory(options.root, options.missionId);
  const logPath = join17(run, "events.jsonl");
  const statePath = join17(run, ".seq.state");
  const lockPath = join17(run, ".seq.lock");
  await Promise.all([
    rejectSymlink(logPath),
    rejectSymlink(statePath),
    rejectSymlink(lockPath)
  ]);
  const lock = await acquireLock2(
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
    if (currentBytes > MAX_EVENT_LOG_BYTES) {
      throw new Error("HOOK_EVENT_LOG_FULL: rotate or archive the run");
    }
    const existing = await existingIdempotentEvent(
      logPath,
      options,
      currentBytes
    );
    if (existing !== void 0) {
      return Object.freeze({ event: existing, appended: false });
    }
    if (options.validate !== void 0) {
      await options.validate(await currentCanonicalEvents(logPath, currentBytes));
    }
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
      eventId: options.eventId ?? `evt_${randomUUID()}`,
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
    return Object.freeze({ event, appended: true });
  } finally {
    await releaseLock2(lock);
  }
}
async function writeSequencedEvent(options) {
  return (await writeSequencedEventInternal(options)).event;
}

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
  return event;
}
async function recordHookEvent(options) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(options.hook)) {
    throw new Error("HOOK_INVALID_NAME: expected a bounded kebab-case name");
  }
  const adapted = adaptRuntimeInput(options.rawInput ?? {}, {
    root: options.root,
    runtime: options.runtime,
    phase: "outcome"
  });
  const missionId = deriveMissionId(
    options.missionId,
    options.runtime,
    adapted?.runtimeSessionId ?? "",
    options.root
  );
  const event = await writeSequencedEvent({
    root: options.root,
    missionId,
    draft: {
      source: `runtime:${options.runtime}`,
      kind: "hook.completed",
      subject: `hook:${options.hook}`,
      correlationId: missionId,
      payload: {
        status: options.status,
        ...options.details ?? {}
      }
    }
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
  const explicitRoot = env["VOID_PROJECT_ROOT"] ?? env["CLAUDE_PROJECT_DIR"];
  const destination = explicitRoot === void 0 ? resolveTelemetryRoot(process.cwd()) : { kind: "resolved", root: explicitRoot };
  if (destination.kind === "unavailable") throw new Error(destination.code);
  await recordRuntimeEvent({
    root: destination.root,
    runtime: runtime(argv[3] ?? env["VOID_AGENT_RUNTIME"]),
    phase: phase(argv[2]),
    rawInput: raw,
    ...env["VOID_MISSION_ID"] === void 0 ? {} : { missionId: env["VOID_MISSION_ID"] }
  });
}

var RULES = new Set(RULE_NAMES);
function isRuleName(value) {
  return value !== void 0 && RULES.has(value);
}
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
function writeVerdict(rule, verdict, write) {
  if (verdict.code === "ALLOW" || verdict.code === "OVERRIDE") return;
  const evidence = verdict.evidence.length === 0 ? "" : `
${verdict.evidence.map((item) => `- ${item}`).join("\n")}`;
  write(`${verdict.code}: ${withGoverningSkill(rule, verdict.message)}${evidence}
`);
}
function runtime2(value) {
  return value === "claude" || value === "codex" ? value : "unknown";
}
function projectRoot() {
  return process.env["VOID_PROJECT_ROOT"] ?? process.env["CLAUDE_PROJECT_DIR"] ?? discoverProjectRoot(process.cwd());
}
function optionalPayload(input) {
  if (input.byteLength === 0) return {};
  try {
    return parseHookPayload(input);
  } catch {
    return void 0;
  }
}
async function refreshFreshnessInBackground(installed) {
  try {
    await resolveFreshness({
      installed,
      env: process.env,
      now: Date.now(),
      timeoutMs: 1e3
    });
  } catch {
  }
}
var telemetryDestination;
function reportTelemetryFailure(error) {
  const unresolved2 = error instanceof Error && error.message === "TELEMETRY_ROOT_UNRESOLVED";
  process.stderr.write(unresolved2 ? "TELEMETRY_ROOT_UNRESOLVED: cannot verify journal destination; check Git worktree metadata and Git availability.\n" : "TELEMETRY_WRITE_FAILED: journal was not recorded; check journal access and storage.\n");
}
async function observeHook(hook, execution, rawInput, agentRuntime, root) {
  try {
    const explicitRoot = process.env["VOID_PROJECT_ROOT"] ?? process.env["CLAUDE_PROJECT_DIR"];
    telemetryDestination ??= explicitRoot === void 0 ? resolveTelemetryRoot(root) : { kind: "resolved", root: explicitRoot };
    if (telemetryDestination.kind === "unavailable") throw new Error(telemetryDestination.code);
    await recordHookEvent({
      root: telemetryDestination.root,
      runtime: agentRuntime,
      hook,
      status: execution.status,
      rawInput,
      details: execution.details,
      ...process.env["VOID_MISSION_ID"] === void 0 ? {} : { missionId: process.env["VOID_MISSION_ID"] }
    });
  } catch (error) {
    reportTelemetryFailure(error);
  }
}
async function runLifecycle(input) {
  const hook = process.argv[3] ?? "";
  const agentRuntime = runtime2(process.argv[4] ?? process.env["VOID_AGENT_RUNTIME"]);
  const root = projectRoot();
  const rawInput = optionalPayload(input);
  if (hook === "context" || hook === "context-continuity") {
    const inputRecord = record3(rawInput);
    const event = inputRecord?.["hook_event_name"];
    if (hook === "context-continuity" && event !== "SessionStart") {
      const execution3 = executeContextContinuity(rawInput ?? {}, root, agentRuntime, Date.now());
      if (execution3.output !== void 0) {
        process.stdout.write(`${JSON.stringify(execution3.output)}
`);
      }
      await observeHook(hook, execution3, rawInput ?? {}, agentRuntime, root);
      return;
    }
    const install = resolveInstall(root, process.env);
    const cached = readFreshnessCache(process.env, Date.now());
    const notice = cached === void 0 ? void 0 : freshnessRelay(compareFreshness(install.version, cached.latest), install.source);
    const alert = cachedInvocationAlert(root);
    if (event === "SessionStart" || hook === "context") {
      const source2 = inputRecord?.["source"];
      const resume = observeResume(root, Date.now(), {
        ...source2 === "startup" || source2 === "resume" || source2 === "clear" || source2 === "compact" || source2 === "fork" ? { source: source2 } : {}
      });
      process.stdout.write(
        `${JSON.stringify(sessionStartOutput(install.version, notice, alert, resume.context))}
`
      );
    }
    const execution2 = hook === "context-continuity" ? executeContextContinuity(rawInput ?? {}, root, agentRuntime, Date.now()) : { status: "ok", details: {} };
    await refreshFreshnessInBackground(install.version);
    refreshInvocationVerdict(root);
    await observeHook(hook, execution2, rawInput ?? {}, agentRuntime, root);
    return;
  }
  if (rawInput === void 0) {
    await observeHook(
      hook || "unknown",
      { status: "degraded", details: { reason: "invalid-hook-input" } },
      {},
      agentRuntime,
      root
    );
    return;
  }
  if (hook === "checkpoint-reminder") {
    const prompt = record3(rawInput)?.["prompt"];
    const output = typeof prompt === "string" ? checkpointReminderOutput(prompt) : void 0;
    const execution2 = {
      status: output === void 0 ? "skipped" : "ok",
      details: { reminded: output !== void 0 }
    };
    if (output !== void 0) process.stdout.write(`${JSON.stringify(output)}
`);
    await observeHook(hook, execution2, rawInput, agentRuntime, root);
    return;
  }
  if (hook === "checkpoint-audit") {
    const now = Date.now();
    const observed = observeResume(root, now);
    const audit = auditCheckpoint({
      now,
      checkpoint: observed.bundle.checkpoint,
      ...observed.checkpointWrittenAt === void 0 ? {} : { checkpointWrittenAt: observed.checkpointWrittenAt },
      git: observed.bundle.git
    });
    const execution2 = {
      status: audit.status,
      details: { reasons: [...audit.reasons] },
      ...audit.reasons.length === 0 ? {} : {
        diagnostic: `void-harness SessionEnd audit: ${audit.reasons.join(", ")}
`
      }
    };
    if (execution2.diagnostic !== void 0) process.stderr.write(execution2.diagnostic);
    await observeHook(hook, execution2, rawInput, agentRuntime, root);
    return;
  }
  const execution = hook === "format" ? executeFormat(rawInput, root, process.env) : hook === "trim" ? executeTrim(rawInput, root, process.env) : hook === "typecheck" ? executeTypecheck(root, process.env) : hook === "large-change" ? executeLargeChange(root, process.env) : void 0;
  if (execution === void 0) return;
  if (execution.diagnostic !== void 0) process.stderr.write(execution.diagnostic);
  if ("output" in execution && execution.output !== void 0) {
    process.stdout.write(`${JSON.stringify(execution.output)}
`);
  }
  await observeHook(hook, execution, rawInput, agentRuntime, root);
}
async function main() {
  const input = await readStdin();
  if (process.argv[2] === "lifecycle") {
    await runLifecycle(input);
    return;
  }
  if (process.argv[2] !== "enforce" && process.argv[2] !== "enforce-ci") {
    try {
      await recordRuntimeEventFromCli(
        parseHookPayload(input),
        process.argv,
        process.env
      );
    } catch (error) {
      reportTelemetryFailure(error);
    }
    return;
  }
  try {
    const requested = process.argv[3];
    if (!isRuleName(requested)) throw new Error("UNKNOWN_ENFORCEMENT_RULE");
    const rule = requested;
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
        root: projectRoot(),
        source: process.argv[2] === "enforce-ci" ? "checked-out" : "tool-input",
        env: process.env
      }
    );
    if (process.argv[2] === "enforce") {
      await observeHook(
        rule,
        {
          status: verdict.allow ? "ok" : "blocked",
          details: {
            code: verdict.code,
            evidenceCount: verdict.evidence.length
          }
        },
        rawInput,
        runtime2(process.argv[4] ?? process.env["VOID_AGENT_RUNTIME"]),
        projectRoot()
      );
    }
    writeVerdict(rule, verdict, (message) => process.stderr.write(message));
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
/*! @babel/parser (MIT)
Copyright (C) 2012-2014 by various contributors (see AUTHORS)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
