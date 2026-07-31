// The catalogue of security scanners the harness knows how to drive.
//
// A scanner is untrusted input twice over: once in what it reports, and once in
// what its manifest entry claims about it. This module handles the second. It
// parses a description and nothing else — reading a manifest installs nothing,
// runs nothing, and cannot compose a command line.
//
// Three properties the schema exists to hold:
//
//   - the command is a bare binary name, resolved from PATH by the caller with
//     no shell involved, so a manifest entry cannot become an execution
//     primitive;
//   - an adapter describes what it does and never grades its own findings, so
//     `severity`, `verdict` and `waivable` are refused outright — the engine
//     decides those from the finding class;
//   - every adapter is bounded in time and output, because a scan that cannot
//     end is a scan that blocks a run forever.
//
// Reading is inert by construction. There is no install hook and no room for
// one: adding a scanner to a list must never execute code on the machines that
// read the list.

import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseDocument } from 'yaml';

export const MAX_MANIFEST_FILE_BYTES = 64 * 1024;
export const MAX_ADAPTERS = 32;
export const MAX_TIMEOUT_SECONDS = 3_600;
export const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

/** A binary name PATH can resolve: no directory, no traversal, no metacharacter. */
const COMMAND = /^[a-z0-9][a-z0-9._-]*$/;

/** Anything that composes, redirects or expands rather than naming a value. */
const SHELL_METACHARACTER = /[$`;|&<>()\\\n\r]/;

const slug = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type AdapterKind = 'sast' | 'secrets' | 'dependency' | 'dast';
type AdapterReach = 'none' | 'localhost' | 'advisory-service' | 'authorized-target';

/**
 * Which network reach each kind of tool may claim.
 *
 * `advisory-service` exists because a dependency scanner queries a vulnerability
 * database, which is a real egress but not a target under test: it needs no
 * pentest authorization, while still being something an offline run must be
 * able to refuse. Folding it into `authorized-target` would have made the
 * authorization gate meaningless by making it routine.
 */
const REACH_BY_KIND: Readonly<Record<AdapterKind, readonly AdapterReach[]>> = Object.freeze({
  sast: ['none'],
  secrets: ['none'],
  dependency: ['none', 'localhost', 'advisory-service'],
  dast: ['authorized-target'],
});

const commandArgument = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !SHELL_METACHARACTER.test(value), {
    message: 'arg must not contain shell metacharacters',
  });

const adapterSchema = z
  .strictObject({
    id: slug,
    kind: z.enum(['sast', 'secrets', 'dependency', 'dast']),
    description: z.string().trim().min(1).max(200),
    /** Resolved from PATH by the runner. Never installed, never shelled out. */
    command: z.string().min(1).max(64).regex(COMMAND, 'command must be a bare binary name'),
    args: z.array(commandArgument).max(32),
    /** How the runner proves the tool is present before it counts on it. */
    versionArgs: z.array(commandArgument).min(1).max(4),
    /**
     * The flag that carries the target, for a tool that has one. The target
     * itself is never written here: it comes from an authorization checked at
     * run time, so a manifest edit can never widen what gets scanned.
     */
    targetFlag: commandArgument.optional(),
    /** The flag that carries a report path, for a tool that will not use stdout. */
    outputFlag: commandArgument.optional(),
    reach: z.enum(['none', 'localhost', 'advisory-service', 'authorized-target']),
    /** The claims a completed run of this tool supports. */
    provides: z.array(slug).min(1).max(8),
    limits: z.strictObject({
      timeoutSeconds: z.number().int().min(1).max(MAX_TIMEOUT_SECONDS),
      maxOutputBytes: z.number().int().min(1_024).max(MAX_OUTPUT_BYTES),
    }),
  })
  .superRefine((adapter, context) => {
    // Kind and reach have to agree. A static analyser reads files; if one also
    // reaches a host, either the kind is wrong or the reach is, and picking for
    // it would be guessing about the network.
    const allowed = REACH_BY_KIND[adapter.kind];
    if (!allowed.includes(adapter.reach)) {
      context.addIssue({
        code: 'custom',
        path: ['reach'],
        message: `reach: ${adapter.reach} is not available to a ${adapter.kind} adapter (allowed: ${allowed.join(', ')})`,
      });
    }
    // A tool that reaches a target needs somewhere to put it; a tool that
    // reaches nothing has no business accepting one.
    if (adapter.kind === 'dast' && adapter.targetFlag === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['targetFlag'],
        message: 'a dast adapter must name the flag that carries its target',
      });
    }
    if (adapter.kind !== 'dast' && adapter.targetFlag !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['targetFlag'],
        message: `targetFlag is only meaningful for a dast adapter, not for ${adapter.kind}`,
      });
    }
  });

const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapters: z.array(adapterSchema).min(1).max(MAX_ADAPTERS),
});

export type SecurityAdapter = z.infer<typeof adapterSchema>;
export type SecurityManifest = z.infer<typeof manifestSchema>;

function manifestError(path: string, message: string): Error {
  return new Error(`SECURITY_MANIFEST_INVALID: ${path}: ${message}`);
}

function issueText(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function parseSecurityManifestYaml(body: string, path: string): SecurityManifest {
  if (new TextEncoder().encode(body).byteLength > MAX_MANIFEST_FILE_BYTES) {
    throw manifestError(path, `file exceeds ${MAX_MANIFEST_FILE_BYTES} bytes`);
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
    throw manifestError(path, error instanceof Error ? error.message : String(error));
  }
  if (document.errors.length > 0) {
    throw manifestError(path, document.errors.map((error) => error.message).join('; '));
  }
  let value: unknown;
  try {
    // No aliases: an anchor expanded many times is how a small file becomes a
    // large one in memory.
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw manifestError(path, error instanceof Error ? error.message : String(error));
  }
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw manifestError(path, issueText(parsed.error));

  const ids = new Set<string>();
  for (const adapter of parsed.data.adapters) {
    if (ids.has(adapter.id)) throw manifestError(path, `duplicate adapter id '${adapter.id}'`);
    ids.add(adapter.id);
  }
  return parsed.data;
}

export const SECURITY_MANIFEST_PATH = join('adapters', 'security', 'manifest.yaml');

/**
 * Read the manifest shipped with a core source tree.
 *
 * An absent manifest is not an error: a project with no scanners declared runs
 * its baseline and reports what it could not measure. A manifest that exists
 * and is unreadable IS an error — silently scanning nothing is the failure this
 * whole file is written to avoid.
 */
export async function loadSecurityManifest(sourceRoot: string): Promise<SecurityManifest | undefined> {
  const path = join(sourceRoot, SECURITY_MANIFEST_PATH);
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) throw manifestError(path, 'symbolic links are not allowed');
  if (!metadata.isFile()) throw manifestError(path, 'path is not a regular file');
  if (metadata.size > MAX_MANIFEST_FILE_BYTES) {
    throw manifestError(path, `file exceeds ${MAX_MANIFEST_FILE_BYTES} bytes`);
  }
  return parseSecurityManifestYaml(await readFile(path, 'utf8'), path);
}
