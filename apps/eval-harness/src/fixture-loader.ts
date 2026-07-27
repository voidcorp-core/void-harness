import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures'));
const MAX_FIXTURE_FILES = 256;
const MAX_FIXTURE_BYTES = 512 * 1024;

function invalid(message: string): never {
  throw new Error(`FIXTURE_PATH_INVALID: ${message}`);
}

function validateRelativePath(value: string, label: string): void {
  const segments = value.split('/');
  if (
    value.length === 0
    || value.length > 512
    || isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes('\\')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) invalid(`${label} must be a normalized relative path`);
}

function withinRoot(path: string): boolean {
  const local = relative(FIXTURES_ROOT, path);
  return local !== '' && !local.startsWith('..') && !isAbsolute(local);
}

function readFixtureFile(directory: string, file: string): string {
  validateRelativePath(file, 'file');
  const path = resolve(FIXTURES_ROOT, directory, file);
  if (!withinRoot(path)) invalid(`file '${file}' leaves the fixture root`);
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > MAX_FIXTURE_BYTES) {
    invalid(`file '${file}' must be a bounded regular file`);
  }
  const canonical = realpathSync(path);
  if (!withinRoot(canonical)) invalid(`file '${file}' resolves outside the fixture root`);
  return readFileSync(canonical, 'utf8');
}

/** Load an explicitly enumerated mini-repository from the committed fixture tree. */
export function loadFixture(
  directory: string,
  files: readonly string[],
): Readonly<Record<string, string>> {
  validateRelativePath(directory, 'directory');
  if (files.length === 0 || files.length > MAX_FIXTURE_FILES || new Set(files).size !== files.length) {
    invalid(`files must contain 1 to ${MAX_FIXTURE_FILES} unique paths`);
  }
  return Object.freeze(Object.fromEntries(files.map((file) => [
    file,
    readFixtureFile(directory, file),
  ])));
}
