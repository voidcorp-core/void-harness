// What the project already decided, so a hook does not overrule it.
//
// Several enforcement rules double a rule the project's linter already has.
// When they disagree, the harness wins — and that is the bug: a project that
// turned `noConsole` off for `tooling/**` in its own config had writes blocked
// there anyway. The hook was not enforcing the project's rule, it was imposing
// a different one nobody wrote down.
//
// So: before blocking, ask the project. A rule the project disabled for a path
// is not enforced there by us either.
//
// Reads fail soft, always. A hook that throws on an unreadable config blocks
// every write in the repository, which is a far worse failure than missing one
// console call.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIGS = ['biome.json', 'biome.jsonc'];

type Severity = string | { level?: string } | undefined;

interface RuleGroups {
  readonly [group: string]: Record<string, Severity> | undefined;
}

interface BiomeLinter {
  readonly rules?: RuleGroups;
}

interface BiomeOverride {
  /** v2 spelling. */
  readonly includes?: unknown;
  /** v1 spelling, still in the wild. */
  readonly include?: unknown;
  readonly linter?: BiomeLinter;
}

interface BiomeConfig {
  readonly linter?: BiomeLinter;
  readonly overrides?: readonly BiomeOverride[];
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

/**
 * Match a path against one glob.
 *
 * Supports `*`, `?` and `**`. `**\/` matches zero or more directories — the
 * case that is easy to get wrong, and the one that decides whether
 * `tooling/**\/*.ts` covers `tooling/compile.ts`.
 */
export function globMatches(pattern: string, path: string): boolean {
  const source = normalize(pattern);
  const target = normalize(path);
  let regex = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string;
    if (character === '*') {
      const doubled = source[index + 1] === '*';
      if (doubled && source[index + 2] === '/') {
        regex += '(?:[^/]*/)*';
        index += 2;
        continue;
      }
      if (doubled) {
        regex += '.*';
        index += 1;
        continue;
      }
      regex += '[^/]*';
      continue;
    }
    if (character === '?') {
      regex += '[^/]';
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

/**
 * Strip JSONC comments and trailing commas.
 *
 * Character by character, tracking whether we are inside a string, because a
 * regex cannot tell a comment from a glob: `"tooling/**\/*.ts"` contains both
 * `/*` and `*\/`, and a substring strip eats the pattern and silently changes
 * what the config says.
 */
function stripJsonc(text: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string;
    const next = text[index + 1];
    if (inLine) {
      if (character === '\n') {
        inLine = false;
        out += character;
      }
      continue;
    }
    if (inBlock) {
      if (character === '*' && next === '/') {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      out += character;
      if (character === '\\') {
        out += next ?? '';
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
    if (character === '/' && next === '/') {
      inLine = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      inBlock = true;
      index += 1;
      continue;
    }
    out += character;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readConfig(root: string): BiomeConfig | undefined {
  for (const name of CONFIGS) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    try {
      // Biome allows comments and trailing commas; refusing to read a valid
      // config would mean overruling a project that did nothing wrong.
      return JSON.parse(stripJsonc(readFileSync(path, 'utf8'))) as BiomeConfig;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** `off`, `on`, or undefined when this config says nothing about the rule. */
function severityOf(rules: RuleGroups | undefined, rule: string): 'off' | 'on' | undefined {
  if (rules === undefined) return undefined;
  for (const group of Object.values(rules)) {
    const severity = group?.[rule];
    if (severity === undefined) continue;
    if (typeof severity === 'string') return severity === 'off' ? 'off' : 'on';
    if (typeof severity === 'object' && severity !== null) return severity.level === 'off' ? 'off' : 'on';
  }
  return undefined;
}

function pathList(override: BiomeOverride): string[] {
  const raw = override.includes ?? override.include;
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Has the project turned this Biome rule off for this path?
 *
 * `rule` is the Biome rule name (`noConsole`), not the harness rule id. The
 * group is not required: a rule name is unique across Biome's groups, and
 * demanding the group would break every time a rule moves between them.
 */
export function isRuleSuppressed(projectRoot: string, rule: string, path: string): boolean {
  const config = readConfig(projectRoot);
  if (config === undefined) return false;
  const target = normalize(path);
  // Later overrides win in Biome, so the last matching one that speaks about
  // this rule decides — including when it turns the rule back ON. Scanning for
  // "any override says off" would leave a re-enabled path silently exempt.
  for (const override of [...(config.overrides ?? [])].reverse()) {
    if (!pathList(override).some((pattern) => globMatches(pattern, target))) continue;
    const severity = severityOf(override.linter?.rules, rule);
    if (severity !== undefined) return severity === 'off';
  }
  return severityOf(config.linter?.rules, rule) === 'off';
}
