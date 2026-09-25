import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { PRODUCT_COMMAND, voidReadPath } from '@voidcorp/hook-runner';
import { z } from 'zod';
import { configSchema } from '../config-schema.js';
import { configPackDirs } from '../packs.js';
import { parseReceipt } from '../receipts.js';
import type { CatalogEntry, Runtime } from './catalog.js';
import { readData } from './read.js';

type Visibility = 'on' | 'off' | 'name-only' | 'user-invocable-only';
export interface LocalEvidence {
  readonly installation: 'absent' | 'installed' | 'unknown';
  readonly runtimes: readonly string[];
  readonly packs: readonly string[];
  readonly assets: Readonly<Record<string, boolean>>;
  readonly overrides: Readonly<Record<string, Visibility>>;
  readonly settingsKnown: boolean;
  readonly localSource: boolean;
}
export interface Availability {
  readonly runtime: Runtime;
  readonly state: 'installed' | 'absent' | 'disabled' | 'inactive-pack' | 'unsupported' | 'unknown';
  readonly reason: string;
  readonly verified: false;
}
const settingsSchema = z.object({
  skillOverrides: z.record(z.string().max(100), z.enum(['on', 'off', 'name-only', 'user-invocable-only'])).optional(),
});

function assetPath(entry: CatalogEntry, runtime: 'claude' | 'codex'): string | undefined {
  switch (entry.type) {
    case 'command': return undefined;
    case 'skill': return `${runtime === 'claude' ? '.claude' : '.agents'}/skills/${entry.name}/SKILL.md`;
    case 'agent':
    case 'specialist': return `${runtime === 'claude' ? '.claude' : '.codex'}/agents/${entry.name}.${runtime === 'claude' ? 'md' : 'toml'}`;
    case 'hook': return `.void/hooks/${entry.name}.sh`;
  }
}

export async function readLocalEvidence(root: string, entries: readonly CatalogEntry[]): Promise<LocalEvidence> {
  const empty = {
    runtimes: [], packs: [], assets: {}, overrides: {}, settingsKnown: false, localSource: false,
  };
  const receiptRead = await readData(root, relative(root, voidReadPath(root, 'receipts', 'install-v1.json')), 1024 * 1024);
  const configRead = await readData(root, '.void/config.json', 128 * 1024);
  if (receiptRead.state === 'missing' && configRead.state === 'missing') return { ...empty, installation: 'absent' };
  if (receiptRead.state !== 'read' || configRead.state !== 'read') return { ...empty, installation: 'unknown' };
  const receipt = parseReceipt(receiptRead.body);
  if (receipt === undefined || receipt.files.length > 2048) return { ...empty, installation: 'unknown' };
  let config: ReturnType<typeof configSchema.safeParse>;
  try { config = configSchema.safeParse(JSON.parse(configRead.body)); }
  catch { return { ...empty, installation: 'unknown' }; }
  if (!config.success) return { ...empty, installation: 'unknown' };
  const overrides: Record<string, Visibility> = {};
  let settingsKnown = true;
  // Claude project/local settings are documented here; no home configuration is read:
  // https://code.claude.com/docs/en/skills#override-skill-visibility-from-settings
  for (const path of ['.claude/settings.json', '.claude/settings.local.json']) {
    const settings = await readData(root, path, 128 * 1024);
    if (settings.state === 'missing') continue;
    if (settings.state !== 'read') { settingsKnown = false; continue; }
    try {
      const parsed = settingsSchema.safeParse(JSON.parse(settings.body));
      if (parsed.success) Object.assign(overrides, parsed.data.skillOverrides);
      else settingsKnown = false;
    } catch { settingsKnown = false; }
  }
  const assets: Record<string, boolean> = {};
  const candidates = new Set(entries.flatMap(entry => (['claude', 'codex'] as const)
    .map(runtime => assetPath(entry, runtime)).filter(path => path !== undefined)));
  let budget = 16 * 1024 * 1024;
  for (const path of [...candidates].sort()) {
    const owned = receipt.files.find(file => file.path === path);
    if (owned === undefined || budget <= 0) continue;
    const limit = Math.min(256 * 1024, budget);
    const asset = await readData(root, path, limit);
    budget -= asset.state === 'read' ? Buffer.byteLength(asset.body) : limit;
    assets[path] = asset.state === 'read'
      && createHash('sha256').update(asset.body).digest('hex') === owned.sha256;
  }
  return {
    installation: 'installed', runtimes: receipt.runtimes, packs: configPackDirs({ packs: config.data.packs ?? {} }),
    assets, overrides, settingsKnown, localSource: receipt.source === 'local',
  };
}

export function availability(entry: CatalogEntry, evidence: LocalEvidence): readonly Availability[] {
  if (entry.type === 'command') return [{ runtime: 'cli', state: 'installed', verified: false, reason: 'Provided by the running CLI.' }];
  return (['claude', 'codex'] as const).map(runtime => {
    const fact = (state: Availability['state'], reason: string): Availability => ({ runtime, state, reason, verified: false });
    if (entry.runtimes.length === 0) return fact('unknown', 'Runtime support is not declared.');
    if (!entry.runtimes.includes(runtime)) return fact('unsupported', 'Not declared for this runtime.');
    if (evidence.installation === 'unknown') return fact('unknown', 'Installation evidence is missing, unreadable or invalid.');
    if (evidence.installation === 'absent') return fact('absent', `No local installation evidence. Run ${PRODUCT_COMMAND} init to install.`);
    if (!evidence.runtimes.includes(runtime)) return fact('absent', 'This runtime is not in the installation receipt.');
    if (entry.pack !== 'core' && !evidence.packs.includes(entry.pack)) return fact('inactive-pack', 'The pack is not enabled in project configuration.');
    if (!evidence.localSource) return fact('unknown', 'Marketplace cache availability is outside this project snapshot.');
    if (runtime === 'claude' && entry.type === 'skill') {
      if (!evidence.settingsKnown) return fact('unknown', 'Claude skill settings are unreadable or invalid.');
      if (evidence.overrides[entry.name] === 'off') return fact('disabled', 'The project Claude skill override is off.');
    }
    const path = assetPath(entry, runtime);
    if (path === undefined || evidence.assets[path] !== true) return fact('unknown', 'No matching receipt-owned asset could be confirmed.');
    return fact('installed', 'Receipt-owned asset matches. Effective runtime visibility and execution are not verified.');
  });
}
