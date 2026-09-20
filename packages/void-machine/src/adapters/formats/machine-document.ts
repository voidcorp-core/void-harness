// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import { parse } from 'smol-toml';
import {
  type DocumentInspection, type MachineDocument, machineConfigSchema, machineLockSchema,
} from '../../verticals/development/doctor.js';
import { readDocument } from '../files/read-document.js';

export function inspectMachineDocument(path: string, kind: MachineDocument): DocumentInspection {
  const document = readDocument(path);
  if (document.kind !== 'read') return document;
  try {
    // smol-toml v1.8.0 src/parse.ts: bounded recursion and exact integer types.
    // https://github.com/squirrelchat/smol-toml/blob/v1.8.0/src/parse.ts
    const parsed: unknown = kind === 'config'
      ? parse(document.text, { maxDepth: 16, integersAsBigInt: true })
      : JSON.parse(document.text);
    const schema = kind === 'config' ? machineConfigSchema : machineLockSchema;
    if (schema.safeParse(parsed).success) return { kind: 'valid' };
    return { kind: 'malformed', cause: 'Document does not match the supported version-one fields' };
  } catch {
    // Parser diagnostics may include file contents; keep them out of reports.
    return { kind: 'malformed', cause: 'Document syntax is invalid or exceeds parser limits' };
  }
}
