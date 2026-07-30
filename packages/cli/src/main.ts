// CLI entry — dispatches to init / add / remove / list / doctor / help.

import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { runtime } from './commands/runtime.js';
import { add } from './commands/add.js';
import { remove } from './commands/remove.js';
import { list } from './commands/list.js';
import { doctor } from './commands/doctor.js';
import { check } from './commands/check.js';
import { update } from './commands/update.js';
import { autopilot } from './commands/autopilot.js';
import { backlogAutopilot } from './commands/backlog-autopilot.js';
import { graph } from './commands/graph.js';
import { audit } from './commands/audit.js';
import { status } from './commands/status.js';
import { adoption } from './commands/adoption.js';
import { decisions } from './commands/decisions.js';
import { mission } from './commands/mission.js';
import { selfHost } from './commands/self-host.js';
import { printHelp } from './commands/help.js';
import { version } from '../package.json';

export async function main(argv: readonly string[]): Promise<void> {
  const [cmd, ...rest] = argv;

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
    // Kept routed for one migration cycle: a deleted command prints a generic
    // "unknown command" and leaves the reader to guess what happened to theirs.
    case 'backlog-autopilot':
      process.exitCode = await backlogAutopilot(rest);
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
    case 'adoption':
      await adoption(rest);
      return;
    case 'decisions':
      await decisions(rest);
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
