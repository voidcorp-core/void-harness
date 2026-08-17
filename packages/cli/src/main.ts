// CLI entry — dispatches to init / add / remove / list / doctor / help.

import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { runtime } from './commands/runtime.js';
import { add } from './commands/add.js';
import { remove } from './commands/remove.js';
import { list } from './commands/list.js';
import { doctor } from './commands/doctor.js';
import { hydrate } from './commands/hydrate.js';
import { check } from './commands/check.js';
import { update } from './commands/update.js';
import { autopilot } from './commands/autopilot.js';
import { graph } from './commands/graph.js';
import { audit } from './commands/audit.js';
import { status } from './commands/status.js';
import { projects } from './commands/projects.js';
import { adoption } from './commands/adoption.js';
import { decisions } from './commands/decisions.js';
import { mission } from './commands/mission.js';
import { security } from './commands/security.js';
import { selfHost } from './commands/self-host.js';
import { printHelp } from './commands/help.js';
import { version } from '../package.json';

/**
 * Commands that print their own, more specific help.
 *
 * Everything else gets the global reference. The list is explicit because the
 * failure it prevents is silent: a command missing from it does not lose its
 * help, it MUTATES the project when asked to explain itself.
 */
const SELF_DOCUMENTING = new Set(['autopilot', 'decisions', 'mission', 'security']);

/** Did the caller ask for help rather than for the command to run? */
export function asksForHelp(cmd: string | undefined, rest: readonly string[]): boolean {
  if (cmd === undefined || SELF_DOCUMENTING.has(cmd)) return false;
  return rest.includes('--help') || rest.includes('-h');
}

export async function main(argv: readonly string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  // `--help` explains; it never acts. Before this, `init --help` installed 135
  // files into the current directory — a command asked to describe itself
  // instead rewrote the project, which is the least forgivable thing a CLI can
  // do. Intercepting once here rather than in each command means the next
  // command added cannot reintroduce it by omission.
  if (asksForHelp(cmd, rest)) {
    printHelp();
    return;
  }

  switch (cmd) {
    case 'init':
      await init(rest);
      return;
    case 'runtime':
      await runtime(rest);
      return;
    case 'add':
      await add(rest);
      return;
    case 'remove':
    case 'rm':
      await remove(rest);
      return;
    case 'list':
    case 'ls':
      await list(rest);
      return;
    case 'hydrate':
      await hydrate(rest);
      break;
    case 'doctor':
      await doctor(rest);
      return;
    case 'check':
      await check(rest);
      return;
    case 'update':
      await update(rest);
      return;
    case 'install':
      await install(rest);
      return;
    case 'autopilot':
      await autopilot(rest);
      return;
    case 'graph':
      await graph(rest);
      return;
    case 'audit':
      await audit(rest);
      return;
    case 'status':
      await status(rest);
      return;
    case 'projects':
      await projects(rest);
      return;
    case 'adoption':
      await adoption(rest);
      return;
    case 'decisions':
      await decisions(rest);
      return;
    case 'security':
      await security(rest);
      return;
    case 'mission':
      await mission(rest);
      return;
    case 'self-host':
      await selfHost(rest);
      return;
    case 'version':
    case '--version':
    case '-v':
      process.stdout.write(`${version}\n`);
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default: {
      console.error(`unknown command: ${cmd}\n`);
      printHelp();
      process.exit(2);
    }
  }
}
