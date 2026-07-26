import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { parseSpecialistContract, type SpecialistContract } from './schema.js';

export const MAX_SPECIALIST_FILE_BYTES = 64 * 1024;
export const MAX_SPECIALIST_FILES = 32;

function yamlError(path: string, message: string): Error {
  return new Error(`SPECIALIST_YAML_INVALID: ${path}: ${message}`);
}

export function parseSpecialistYaml(body: string, path: string): SpecialistContract {
  if (new TextEncoder().encode(body).byteLength > MAX_SPECIALIST_FILE_BYTES) {
    throw yamlError(path, `file exceeds ${MAX_SPECIALIST_FILE_BYTES} bytes`);
  }
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(body, {
      strict: true,
      stringKeys: true,
      uniqueKeys: true,
      version: '1.2',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw yamlError(path, message);
  }
  if (document.errors.length > 0) {
    throw yamlError(path, document.errors.map((error) => error.message).join('; '));
  }
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw yamlError(path, message);
  }
  try {
    return parseSpecialistContract(value, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw yamlError(path, message);
  }
}

export async function loadSpecialists(sourceRoot: string): Promise<readonly SpecialistContract[]> {
  const directory = join(sourceRoot, 'specialists');
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .filter((entry) => /\.ya?ml$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (candidates.length > MAX_SPECIALIST_FILES) {
    throw new Error(`SPECIALIST_FILE_LIMIT: ${directory} exceeds ${MAX_SPECIALIST_FILES} files`);
  }
  const contracts: SpecialistContract[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of candidates) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw yamlError(path, 'symbolic links are not allowed');
    if (!metadata.isFile()) throw yamlError(path, 'path is not a regular file');
    if (metadata.size > MAX_SPECIALIST_FILE_BYTES) {
      throw yamlError(path, `file exceeds ${MAX_SPECIALIST_FILE_BYTES} bytes`);
    }
    const contract = parseSpecialistYaml(await readFile(path, 'utf8'), path);
    if (ids.has(contract.id)) throw yamlError(path, `duplicate specialist id '${contract.id}'`);
    if (names.has(contract.name)) throw yamlError(path, `duplicate specialist name '${contract.name}'`);
    ids.add(contract.id);
    names.add(contract.name);
    contracts.push(contract);
  }
  return contracts;
}
