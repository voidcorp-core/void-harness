// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import { z } from 'zod';
import { renderDoctorJson, renderDoctorText } from '../adapters/formats/doctor-report.js';
import { inspectDoctor } from './doctor.js';

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] !== 'doctor' || args.length > 2
    || (args.length === 2 && args[1] !== '--json')) {
    process.stderr.write('usage: void-machine doctor [--json]\n');
    process.exitCode = 2;
    return;
  }
  // Node exposes a special environment object; Zod records require a plain object.
  // Snapshot at the executable edge, then validate every value unchanged.
  const environment = z.record(z.string(), z.string().optional()).parse({ ...process.env });
  const report = inspectDoctor({ cwd: process.cwd(), environment });
  const output = args[1] === '--json' ? renderDoctorJson(report) : renderDoctorText(report);
  process.stdout.write(`${output}\n`);
  process.exitCode = report.health === 'healthy' ? 0 : 1;
}

main();
