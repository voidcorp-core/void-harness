// CLI entry — dispatches to init / add / remove / list / doctor / help.

import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { add } from './commands/add.js';
import { remove } from './commands/remove.js';
import { list } from './commands/list.js';
import { doctor } from './commands/doctor.js';
import { check } from './commands/check.js';
import { update } from './commands/update.js';
import { printHelp } from './commands/help.js';

export async function main(argv: readonly string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'init':
      await init(rest);
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
