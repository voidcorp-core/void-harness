import type { Dirent } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseProfile, type ProfileDocument } from '@voidcorp/mission-engine';
import { parseDocument, visit } from 'yaml';

export const MAX_PROFILE_FILE_BYTES = 64 * 1024;
export const MAX_PROFILE_FILES = 64;

function profileError(path: string, message: string): Error {
  return new Error(`PROFILE_YAML_INVALID: ${path}: ${message}`);
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function parseProfileYaml(body: string, path: string): ProfileDocument {
  if (new TextEncoder().encode(body).byteLength > MAX_PROFILE_FILE_BYTES) {
    throw profileError(path, `file exceeds ${MAX_PROFILE_FILE_BYTES} bytes`);
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
    throw profileError(path, error instanceof Error ? error.message : String(error));
  }
  if (document.errors.length > 0) {
    throw profileError(path, document.errors.map((error) => error.message).join('; '));
  }
  let hasAlias = false;
  visit(document, { Alias: () => { hasAlias = true; } });
  if (hasAlias) throw profileError(path, 'aliases are forbidden');
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw profileError(path, error instanceof Error ? error.message : String(error));
  }
  const parsed = parseProfile(value);
  if (!parsed.ok) throw profileError(path, parsed.issue.message);
  return parsed.value;
}

async function profileFiles(
  canonicalBoundary: string,
  directory: string,
  project: boolean,
): Promise<readonly string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const names = entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && (
      project ? /\.profile\.ya?ml$/i.test(entry.name) : /\.ya?ml$/i.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort();
  if (names.length > MAX_PROFILE_FILES) {
    throw new Error(`PROFILE_FILE_LIMIT: ${directory} exceeds ${MAX_PROFILE_FILES} files`);
  }
  const paths: string[] = [];
  for (const name of names) {
    const source = join(directory, name);
    const canonicalSource = await realpath(source);
    if (!isWithin(canonicalBoundary, canonicalSource)) {
      throw new Error(`PROFILE_PATH_ESCAPE: ${source} resolves outside its allowed root`);
    }
    const metadata = await stat(canonicalSource);
    if (!metadata.isFile()) throw profileError(source, 'profile path is not a regular file');
    if (metadata.size > MAX_PROFILE_FILE_BYTES) {
      throw profileError(source, `file exceeds ${MAX_PROFILE_FILE_BYTES} bytes`);
    }
    paths.push(canonicalSource);
  }
  return Object.freeze(paths);
}

export async function loadProfiles(
  root: string,
  coreProfileDirectory: string,
): Promise<readonly ProfileDocument[]> {
  const canonicalRoot = await realpath(resolve(root));
  const canonicalCore = await realpath(resolve(coreProfileDirectory));
  const coreFiles = await profileFiles(canonicalCore, canonicalCore, false);
  if (coreFiles.length === 0) {
    throw new Error(`PROFILE_CORE_MISSING: ${canonicalCore} has no YAML profiles`);
  }
  const projectDirectory = join(canonicalRoot, '.void', 'profiles');
  const projectFiles = await profileFiles(canonicalRoot, projectDirectory, true);
  const profiles: ProfileDocument[] = [];
  for (const path of [...coreFiles, ...projectFiles]) {
    profiles.push(parseProfileYaml(await readFile(path, 'utf8'), path));
  }
  const byId = new Map<string, string>();
  for (const profile of profiles) {
    const previous = byId.get(profile.id);
    if (previous !== undefined) {
      throw new Error(`PROFILE_ID_DUPLICATE: duplicate profile id '${profile.id}' (${previous}, ${profile.name})`);
    }
    byId.set(profile.id, profile.name);
  }
  return Object.freeze(profiles.sort((left, right) =>
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id)));
}
