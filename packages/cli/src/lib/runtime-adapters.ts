// The runtime seam. The harness authors ONE doctrine and compiles it to each
// agent runtime through an adapter. Core commands (init / runtime add / doctor)
// iterate the adapters for detect / prerequisites / wire / doctorChecks rather
// than switching on a runtime name; adding a runtime (Codex exec, Hermes, a
// local agent, ...) is a new adapter object registered in ADAPTERS here, with
// zero edits to that iterated surface.
//
// One axis stays intentionally OUTSIDE the adapter contract: the Claude
// MARKETPLACE (pin resolution, marketplace reachability, plugin-cache + remote
// version health). No other runtime has a marketplace, so the commands gate it
// with an explicit `claude` check rather than pretending it is a generic adapter
// concern — the one honest exception to "iterate, don't branch", not a leak to
// fold away.
//
// This is the AGENT-RUNTIME axis only. The orthogonal MODEL-PROVIDER axis
// (Anthropic / OpenAI-compatible / Ollama / custom) is a separate seam and is
// deliberately NOT conflated here — see docs/specs/2026-07-21-...-multiruntime.
//
// Each adapter owns exactly its runtime-specific surface: how to detect it, its
// extra prerequisites, how to wire its active layer (including its own doctrine
// doc), the "how to start using it" steps, and its health checks. Everything
// runtime-agnostic (stack detection, .void/config.json, PHILOSOPHY /
// PROJECT-DOCTRINE, pack selection) stays in the commands.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CORE_PLUGIN_NAME,
  MARKETPLACE_NAME,
  enabledPluginsKey,
  packDirForName,
  type PackDescriptor,
} from './packs.js';
import {
  mergeSettings,
  readSettings,
  settingsPathFor,
  writeSettings,
} from './settings.js';
import { docFileFor, HARNESS_BLOCK_MARKER, patchRuntimeDoc } from './claude-md.js';
import {
  CODEX_HOOKS_DIR,
  codexFloorHealth,
  wireCodexFloor,
} from './codex-floor.js';
import { CODEX_SKILLS_DIR, codexSkillsHealth, wireCodexSkills } from './codex-skills.js';
import { wireCodexAgents } from './codex-agents.js';
import { checkGh, checkMarketplaceAccess, type CheckResult } from './prerequisites.js';
import { detectRuntimes, type Runtime } from './runtime.js';

/** Everything an adapter's `wire` may need. Runtime-agnostic inputs the command computed. */
export interface RuntimeWireContext {
  readonly projectRoot: string;
  readonly sourceRoot: string;
  readonly enabledPlugins: readonly string[];
  readonly enabledPacks: readonly PackDescriptor[];
  readonly marketplaceRepo: string;
  /** undefined when the Claude marketplace pin could not be resolved (offline). */
  readonly pinVersion: string | undefined;
}

export interface RuntimeWireOutcome {
  /** Raw status messages; the command renders each as a `✓ <id> <message>` line. */
  readonly statusLines: readonly string[];
  /** "How to start using it" checklist items; a `FAILED:`-prefixed item is a blocker. */
  readonly nextSteps: readonly string[];
}

export interface RuntimeAdapter {
  readonly id: Runtime;
  readonly label: string;
  /** Does this runtime already show a footprint in the project? */
  detect(projectRoot: string): boolean;
  /** Extra prerequisite checks beyond the always-checked jq (empty for a runtime with none). */
  prerequisites(marketplaceRepo: string): readonly CheckResult[];
  /** Materialize this runtime's active layer + its own doctrine doc. Idempotent. */
  wire(ctx: RuntimeWireContext): Promise<RuntimeWireOutcome>;
  /** Health checks for this runtime's wiring + doc, for `doctor`. Never throws. */
  doctorChecks(projectRoot: string): Promise<readonly CheckResult[]>;
}

async function docBlockCheck(projectRoot: string, runtime: Runtime): Promise<CheckResult> {
  const file = docFileFor(runtime);
  const path = join(projectRoot, file);
  if (!existsSync(path)) {
    return { name: file, ok: false, message: 'missing', fix: `void-harness runtime add ${runtime}` };
  }
  const text = await readFile(path, 'utf8');
  return text.includes(HARNESS_BLOCK_MARKER)
    ? { name: file, ok: true, message: 'void-harness block present' }
    : { name: file, ok: false, message: 'void-harness block missing', fix: `void-harness runtime add ${runtime}` };
}

const claudeAdapter: RuntimeAdapter = {
  id: 'claude',
  label: 'Claude Code',
  detect: (root) => existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md')),
  prerequisites: (repo) => [checkGh(), checkMarketplaceAccess(repo)],
  async wire(ctx) {
    const settingsPath = settingsPathFor(ctx.projectRoot);
    const existing = await readSettings(settingsPath);
    const merged = mergeSettings(existing, {
      enabledPlugins: ctx.enabledPlugins,
      marketplaceRepo: ctx.marketplaceRepo,
    });
    await writeSettings(settingsPath, merged);
    const docResult = await patchRuntimeDoc(ctx.projectRoot, 'claude', {
      enabledPlugins: ctx.enabledPlugins,
      enabledPacks: ctx.enabledPacks,
    });
    const nextSteps = [
      'restart Claude Code (skills load on session start)',
      'accept the plugin trust prompt on first load',
    ];
    if (ctx.pinVersion === undefined) {
      nextSteps.push(
        'FAILED: core version could not be resolved from the marketplace — once it is reachable, run void-harness update to pin it',
      );
    }
    return {
      statusLines: [
        `settings.json: extraKnownMarketplaces.${MARKETPLACE_NAME} + enabledPlugins merged`,
        `CLAUDE.md: ${docResult}`,
      ],
      nextSteps,
    };
  },
  async doctorChecks(projectRoot) {
    const checks: CheckResult[] = [];
    const settingsPath = settingsPathFor(projectRoot);
    if (!existsSync(settingsPath)) {
      checks.push({ name: 'settings.json', ok: false, message: '.claude/settings.json missing', fix: 'void-harness runtime add claude' });
    } else {
      const settings = await readSettings(settingsPath);
      const markets = settings.extraKnownMarketplaces ?? {};
      const enabledPlugins = settings.enabledPlugins ?? {};
      const hasMarketplace = markets[MARKETPLACE_NAME] !== undefined;
      const hasCore = enabledPlugins[enabledPluginsKey(CORE_PLUGIN_NAME)] === true;
      if (hasMarketplace && hasCore) {
        const active = Object.keys(enabledPlugins).filter((k) => enabledPlugins[k] === true).length;
        checks.push({ name: 'settings.json', ok: true, message: `marketplace registered, ${active} plugin(s) enabled` });
      } else {
        const missing = [
          !hasMarketplace && `extraKnownMarketplaces.${MARKETPLACE_NAME}`,
          !hasCore && `enabledPlugins["${enabledPluginsKey(CORE_PLUGIN_NAME)}"]`,
        ].filter(Boolean).join(', ');
        checks.push({ name: 'settings.json', ok: false, message: `missing: ${missing}`, fix: 'void-harness runtime add claude' });
      }
    }
    checks.push(await docBlockCheck(projectRoot, 'claude'));
    return checks;
  },
};

const codexAdapter: RuntimeAdapter = {
  id: 'codex',
  label: 'Codex',
  detect: (root) => existsSync(join(root, '.codex')) || existsSync(join(root, 'AGENTS.md')),
  prerequisites: () => [],
  async wire(ctx) {
    const staged = await wireCodexFloor(ctx.projectRoot, ctx.sourceRoot);
    // For Codex we materialize the skills into .agents/skills (its directory-
    // convention discovery) rather than a marketplace fetch — core skills plus the
    // skills of every activated pack (marketplace name harness-<x> maps to the
    // source dir pack-<x>). Native Codex plugin channel: tracked in #144.
    const packDirs = ctx.enabledPacks.map((p) => packDirForName(p.name)).filter((d): d is string => d !== undefined);
    const skills = await wireCodexSkills(ctx.projectRoot, ctx.sourceRoot, packDirs);
    // Claude gets the five read-only critics as context-isolated SUBAGENTS from
    // the plugin. Codex has no stable equivalent (its subagents are still
    // experimental, its custom prompts deprecated in favour of skills), so we
    // compile the same authored agent definitions into Codex skills rather than
    // author a second copy that would drift. See codex-agents.ts.
    const agents = await wireCodexAgents(ctx.projectRoot, ctx.sourceRoot);
    const docResult = await patchRuntimeDoc(ctx.projectRoot, 'codex', {
      enabledPlugins: ctx.enabledPlugins,
      enabledPacks: ctx.enabledPacks,
    });
    return {
      statusLines: [
        `.codex/hooks.json: ${staged} hook scripts wired → ${CODEX_HOOKS_DIR}/`,
        `${CODEX_SKILLS_DIR}/: ${skills} skills + ${agents} compiled agents wired for Codex discovery`,
        `AGENTS.md: ${docResult}`,
      ],
      nextSteps: ['trust the project .codex/ layer per your Codex config (the safety floor is wired)'],
    };
  },
  async doctorChecks(projectRoot) {
    const floor = await codexFloorHealth(projectRoot);
    const skills = await codexSkillsHealth(projectRoot);
    return [
      {
        name: 'codex floor',
        ok: floor.ok,
        message: floor.detail,
        ...(floor.ok ? {} : { fix: 'void-harness runtime add codex' }),
      },
      {
        name: 'codex skills',
        ok: skills.ok,
        message: skills.detail,
        ...(skills.ok ? {} : { fix: 'void-harness runtime add codex' }),
      },
      await docBlockCheck(projectRoot, 'codex'),
    ];
  },
};

/** The registry. Adding a runtime = one more adapter here. */
export const ADAPTERS: readonly RuntimeAdapter[] = [claudeAdapter, codexAdapter];

export function adapterFor(runtime: Runtime): RuntimeAdapter {
  const found = ADAPTERS.find((a) => a.id === runtime);
  if (!found) throw new Error(`no adapter for runtime '${runtime}'`);
  return found;
}

/** Adapters for a selected set, in registry order. */
export function adaptersFor(runtimes: readonly Runtime[]): readonly RuntimeAdapter[] {
  return ADAPTERS.filter((a) => runtimes.includes(a.id));
}

/** Adapters whose runtime shows a footprint in the project, in registry order. */
export function detectedAdapters(projectRoot: string): readonly RuntimeAdapter[] {
  const detected = detectRuntimes(projectRoot);
  return ADAPTERS.filter((a) => detected.has(a.id));
}
