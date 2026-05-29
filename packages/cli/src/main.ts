// CLI entry — dispatches to install / init / doctor / help.
//
// Keep this file lean. Each command lives in its own module under `./commands/`.

import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { doctor } from './commands/doctor.js';
import { printHelp } from './commands/help.js';

export async function main(argv: readonly string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'install':
      await install(rest);
      return;
    case 'init':
      await init(rest);
      return;
    case 'doctor':
      await doctor(rest);
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
