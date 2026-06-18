// First-run config wizard for backlog-loop. Kept out of config.ts so the merge
// stays pure: the pure parts here (buildFileConfig, wizardShouldRun, paths) are
// unit-tested; the interactive shell (runWizard) is thin glue over @clack.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import type { FileConfig } from './config.js';

export function autonomousConfigPath(root: string): string {
  return join(root, '.void', 'autonomous.json');
}

export function hasConfig(root: string): boolean {
  return existsSync(autonomousConfigPath(root));
}

/** Run the wizard only on a genuine first run at an interactive terminal. */
export function wizardShouldRun(configExists: boolean, isTty: boolean, interactive: boolean): boolean {
  return !configExists && isTty && interactive;
}

export interface WizardAnswers {
  readonly scope: string;
  readonly target: string;
  readonly maxRaw: string;
  readonly autoMerge: boolean;
}

/** Pure: shape the raw answers into a FileConfig (omitting blanks). */
export function buildFileConfig(answers: WizardAnswers): FileConfig {
  const max = Number.parseInt(answers.maxRaw, 10);
  return {
    ...(answers.scope.trim() !== '' ? { linearScope: answers.scope.trim() } : {}),
    ...(answers.target.trim() !== '' ? { targetState: answers.target.trim() } : {}),
    ...(Number.isNaN(max) ? {} : { maxIterations: max }),
    autoMerge: answers.autoMerge,
  };
}

/** Write the config file (creating .void/), returning its path. */
export function writeConfig(root: string, config: FileConfig): string {
  const path = autonomousConfigPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

/** Interactive first-run setup; returns the written config, or undefined if cancelled. */
export async function runWizard(root: string): Promise<FileConfig | undefined> {
  p.intro('backlog-loop — first run setup');

  const scope = await p.text({
    message: 'Linear scope to drain (team / project / cycle)',
    placeholder: 'Team Sesame / Todo',
  });
  if (p.isCancel(scope)) return cancel();

  const target = await p.text({ message: 'State that means "ready to work"', defaultValue: 'Todo', placeholder: 'Todo' });
  if (p.isCancel(target)) return cancel();

  const maxRaw = await p.text({ message: 'Max tickets per run', defaultValue: '5', placeholder: '5' });
  if (p.isCancel(maxRaw)) return cancel();

  const autoMerge = await p.confirm({ message: 'Auto-merge PRs after green CI?', initialValue: false });
  if (p.isCancel(autoMerge)) return cancel();

  const config = buildFileConfig({ scope: String(scope), target: String(target), maxRaw: String(maxRaw), autoMerge });
  const path = writeConfig(root, config);
  p.outro(`wrote ${path}`);
  return config;
}

function cancel(): undefined {
  p.cancel('Aborted — no config written.');
  return undefined;
}
