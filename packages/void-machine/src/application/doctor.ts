// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import { join } from 'node:path';
import { inspectMachineDocument } from '../adapters/formats/machine-document.js';
import { type Environment, repositoryPaths } from '../adapters/git/repository.js';
import {
  type DoctorReport, doctorReport, documentFindings, repositoryUnavailable,
} from '../verticals/development/doctor.js';

export interface DoctorInput {
  readonly cwd: string;
  readonly environment: Environment;
}

export function inspectDoctor(input: DoctorInput): DoctorReport {
  const paths = repositoryPaths(input.cwd, input.environment);
  if (paths === undefined) return doctorReport(undefined, [repositoryUnavailable()]);
  const config = inspectMachineDocument(join(paths.repository, '.void', 'machine.toml'), 'config');
  const lock = inspectMachineDocument(join(paths.repository, '.void', 'machine.lock.json'), 'lock');
  return doctorReport(paths, [
    ...documentFindings('config', config),
    ...documentFindings('lock', lock),
  ]);
}
