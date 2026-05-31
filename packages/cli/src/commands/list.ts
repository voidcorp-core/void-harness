// `void-harness list` — show active and available plugins for the current project.

import * as p from '@clack/prompts';
import { CORE_PLUGIN_NAME, enabledPluginsKey, MARKETPLACE_NAME, PACKS } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';

export async function list(_args: readonly string[]): Promise<void> {
  const projectRoot = process.cwd();
  const settings = await readSettings(settingsPathFor(projectRoot));
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>;

  p.intro(`void-harness list`);
  p.log.info(`Marketplace: ${MARKETPLACE_NAME} (https://github.com/voidcorp-core/void-harness)`);
  p.log.message('');

  const isActive = (name: string): boolean => enabled[enabledPluginsKey(name)] === true;

  // Core
  p.log.message(`CORE`);
  p.log.message(`  ${isActive(CORE_PLUGIN_NAME) ? '✓' : '✗'} ${CORE_PLUGIN_NAME} — universal craftsman skills (always available)`);
  p.log.message('');

  // Packs
  p.log.message(`PACKS`);
  for (const pack of PACKS) {
    const mark = isActive(pack.name) ? '✓' : '✗';
    p.log.message(`  ${mark} ${pack.name.padEnd(16)} ${pack.description}`);
  }

  p.outro(`Run \`void-harness add <name>\` to activate a pack, \`remove <name>\` to deactivate.`);
}
