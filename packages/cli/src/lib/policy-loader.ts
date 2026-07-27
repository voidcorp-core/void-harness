import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type {
  PolicyDocument,
  PolicyLayer,
} from '@voidcorp/mission-engine';
import { parsePolicy } from '@voidcorp/mission-engine';
import { parseDocument } from 'yaml';

export const MAX_POLICY_FILE_BYTES = 64 * 1024;
export const MAX_POLICY_FILES = 32;

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function yamlError(path: string, message: string): Error {
  return new Error(`POLICY_YAML_INVALID: ${path}: ${message}`);
}

export function parsePolicyYaml(body: string, path: string): PolicyDocument {
  if (new TextEncoder().encode(body).byteLength > MAX_POLICY_FILE_BYTES) {
    throw yamlError(path, `file exceeds ${MAX_POLICY_FILE_BYTES} bytes`);
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
  const parsed = parsePolicy(value);
  if (!parsed.ok) throw yamlError(path, parsed.issue.message);
  return parsed.value;
}

async function readPolicy(path: string, expectedLayer: PolicyLayer): Promise<PolicyDocument> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw yamlError(path, 'policy path is not a regular file');
  if (metadata.size > MAX_POLICY_FILE_BYTES) {
    throw yamlError(path, `file exceeds ${MAX_POLICY_FILE_BYTES} bytes`);
  }
  const policy = parsePolicyYaml(await readFile(path, 'utf8'), path);
  if (policy.layer !== expectedLayer) {
    throw yamlError(
      path,
      `declares layer '${policy.layer}', expected '${expectedLayer}'`,
    );
  }
  return policy;
}

function acceptsPolicyFile(name: string, layer: PolicyLayer): boolean {
  if (layer === 'core' || layer === 'project') return /\.ya?ml$/i.test(name);
  return /\.policy\.ya?ml$/i.test(name);
}

async function directoryPolicies(
  canonicalRoot: string,
  directory: string,
  layer: PolicyLayer,
): Promise<PolicyDocument[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }
  const names = entries
    .filter((entry) =>
      (entry.isFile() || entry.isSymbolicLink())
      && acceptsPolicyFile(entry.name, layer),
    )
    .map((entry) => entry.name)
    .sort();
  if (names.length > MAX_POLICY_FILES) {
    throw new Error(
      `POLICY_FILE_LIMIT: ${directory} exceeds ${MAX_POLICY_FILES} files`,
    );
  }
  const policies: PolicyDocument[] = [];
  for (const name of names) {
    const source = join(directory, name);
    const canonicalSource = await realpath(source);
    if (!isWithin(canonicalRoot, canonicalSource)) {
      throw new Error(`POLICY_PATH_ESCAPE: ${source} resolves outside project root`);
    }
    policies.push(await readPolicy(canonicalSource, layer));
  }
  return policies;
}

export async function loadProjectPolicies(
  root: string,
  corePolicyDirectory: string,
): Promise<readonly PolicyDocument[]> {
  const canonicalRoot = await realpath(resolve(root));
  const canonicalCore = await realpath(resolve(corePolicyDirectory));
  const core = await directoryPolicies(canonicalCore, canonicalCore, 'core');
  if (core.length === 0) {
    throw new Error(`POLICY_CORE_MISSING: ${canonicalCore} has no YAML policy`);
  }
  const locations: ReadonlyArray<readonly [PolicyLayer, string]> = [
    ['profile', join(canonicalRoot, '.void', 'profiles')],
    ['organization', join(canonicalRoot, '.void', 'organization')],
    ['project', join(canonicalRoot, '.void', 'policies')],
  ];
  const policies: PolicyDocument[] = [...core];
  for (const [layer, directory] of locations) {
    policies.push(...await directoryPolicies(canonicalRoot, directory, layer));
  }
  return Object.freeze(policies);
}
