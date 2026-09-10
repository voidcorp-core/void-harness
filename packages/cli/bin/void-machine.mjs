#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write('usage: void-machine doctor [--json]\n');
  process.exit(2);
}

const binary = process.env.VOID_MACHINE_BIN ?? 'void-machine';
const result = spawnSync(binary, args, { stdio: 'inherit', shell: false });
if (result.error) {
  if (args[0] === 'doctor' && args.includes('--json')) {
    process.stdout.write(JSON.stringify({
      schemaVersion: 1,
      health: 'blocked',
      repository: null,
      gitCommonDirectory: null,
      stateDirectory: null,
      cacheDirectory: null,
      findings: [{
        code: 'native.binary.absent',
        severity: 'blocked',
        problem: 'Native void-machine binary is unavailable',
        cause: 'The compatibility launcher cannot find the platform binary',
        repair: 'Install the platform package or set VOID_MACHINE_BIN',
      }],
    }) + '\n');
  } else {
    process.stderr.write('native void-machine binary is unavailable\n');
  }
  process.exit(1);
}
process.exit(result.status ?? 1);

