// `void-harness list` — show active and available plugins for the current project.

import { CORE_PLUGIN_NAME, enabledPluginsKey, MARKETPLACE_NAME, PACKS } from '../lib/packs.js';
import { readSettings, settingsPathFor } from '../lib/settings.js';
import { banner, blank, c, footer, glyph, line, meta, row } from '../lib/render.js';

export async function list(_args: readonly string[]): Promise<void> {
  const projectRoot = process.cwd();
  const settings = await readSettings(settingsPathFor(projectRoot));
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>;

  banner('list');
  meta('marketplace', MARKETPLACE_NAME);
  blank();

  const isActive = (name: string): boolean => enabled[enabledPluginsKey(name)] === true;

  line(c.dim('core'));
  row({
    mark: isActive(CORE_PLUGIN_NAME) ? 'ok' : 'info',
    label: CORE_PLUGIN_NAME,
    suffix: c.dim('universal craftsman skills (always available)'),
  });

  blank();
  line(c.dim('packs'));
  for (const pack of PACKS) {
    row({
      mark: isActive(pack.name) ? 'ok' : 'info',
      label: pack.name,
      suffix: c.dim(pack.description),
    });
  }

  footer(
    `${c.dim('add')} ${c.bold('void-harness add <name>')} ${c.dim(`${glyph.emdash} remove with`)} ${c.bold('rm <name>')}`,
  );
}
