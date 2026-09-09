import { homedir } from 'node:os';
import { join } from 'node:path';
import { readDiscoveryConfig } from './config.js';
import {
  type DiscoveryResult,
  discoverProjects,
} from './discover.js';

export interface ConfiguredProjectDiscovery extends DiscoveryResult {
  readonly roots: readonly string[];
  readonly rootsSource: 'declared' | 'derived';
}

export interface ConfiguredProjectDiscoveryOptions {
  readonly globalDir?: string;
  readonly cwd?: string;
}

export function voidGlobalDir(): string {
  return process.env['VOID_GLOBAL_DIR'] ?? join(homedir(), '.void');
}

/** One configured marker scan shared by every cross-project reader. */
export function discoverConfiguredProjects(
  options: ConfiguredProjectDiscoveryOptions = {},
): ConfiguredProjectDiscovery {
  const config = readDiscoveryConfig({
    globalDir: options.globalDir ?? voidGlobalDir(),
    cwd: options.cwd ?? process.cwd(),
  });
  const discovered = discoverProjects({ roots: config.roots, exclude: config.exclude });
  return {
    ...discovered,
    roots: config.roots,
    rootsSource: config.source,
  };
}
