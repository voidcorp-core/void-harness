// Persist the run cursor so a crash, a compaction or a new session in the same
// clone can pick the run back up.
//
// Writes go through temp + fsync + rename, which is the only sequence that
// makes a reader see either the whole previous state or the whole new one. A
// half-written cursor is worse than none: it would describe a run that never
// existed, and resume acts on what it reads.
//
// Reads fail closed. Truncated, legacy, symlinked, escaping — all refuse, and
// none of them repair or delete anything. The file is left exactly as found so
// a human can look at it; the recovery path is `abort`, which rebuilds from the
// tracker and git rather than from a cursor nobody trusts.

import { closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { autopilotFailure } from './errors.js';
import { parseRunState, type RunState, serializeRunState } from './run-state.js';
import { voidMachinePath } from '@voidcorp/hook-runner';

const STATE_FILE = 'state.json';
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function assertRunId(runId: string): string {
  // No slash at all, so a run id can never contribute a path segment. This is
  // stricter than the marker slug on purpose: this value builds a directory.
  if (typeof runId !== 'string' || !RUN_ID.test(runId) || runId === '.' || runId === '..') {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the run id cannot be used as a directory name',
      `\`runId\` is ${JSON.stringify(runId)}`,
      'use a run id of letters, digits, dot, dash or underscore, with no path separator',
    );
  }
  return runId;
}

export function autopilotDirectory(root: string): string {
  // Observed state: a run's lease, worktrees and journals are this machine's.
  return voidMachinePath(resolve(root), 'autopilot');
}

export function runDirectory(root: string, runId: string): string {
  const dir = join(autopilotDirectory(root), assertRunId(runId));
  const base = autopilotDirectory(root);
  if (!dir.startsWith(base + sep)) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the resolved run directory is outside the autopilot directory',
      `\`${runId}\` resolves to ${dir}`,
      'use a run id that names a single directory under .void/autopilot',
    );
  }
  return dir;
}

function assertNotSymlink(file: string): void {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(file);
  } catch {
    return; // absent is fine; the caller decides what that means
  }
  if (stat.isSymbolicLink()) {
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the run state path is a symlink',
      `${file} is a symbolic link, so reading or writing it would follow it somewhere this run does not own`,
      'remove the symlink; a run cursor is a plain file under .void/autopilot',
    );
  }
}

/** Read a run's cursor, or undefined when this clone never started it. */
export function readRun(root: string, runId: string): RunState | undefined {
  if (isAbsolute(runId)) assertRunId(runId);
  const file = join(runDirectory(root, runId), STATE_FILE);
  assertNotSymlink(file);

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the run state could not be read',
      error instanceof Error ? error.message : String(error),
      'check the permissions of .void/autopilot, then run the command again',
    );
  }
  return parseRunState(text);
}

/**
 * Write a run's cursor atomically: a reader always sees a whole state.
 *
 * fsync before rename is what makes that true across a power loss — without it
 * the rename can land while the bytes are still in flight, leaving an empty
 * file where a cursor should be.
 */
export function writeRun(root: string, state: RunState): void {
  const dir = runDirectory(root, state.runId);
  const file = join(dir, STATE_FILE);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  assertNotSymlink(file);

  const temp = join(dir, `.${STATE_FILE}.tmp`);
  const body = serializeRunState(state);
  let handle: number | undefined;
  try {
    // 0600: the cursor names branches, tickets and a pull request. Nothing
    // secret, but nothing another account on the machine needs either.
    handle = openSync(temp, 'w', 0o600);
    writeSync(handle, body);
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    renameSync(temp, file);
  } catch (error) {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // the write already failed; the close error adds nothing
      }
    }
    try {
      unlinkSync(temp);
    } catch {
      // a leftover temp is inert: the rename is what publishes a state
    }
    throw autopilotFailure(
      'AUTOPILOT_CONTRACT',
      'the run state could not be written',
      error instanceof Error ? error.message : String(error),
      'free disk space or fix the permissions of .void/autopilot, then run the command again',
    );
  }
}

/** Run ids this clone knows about, sorted. */
export function listRunIds(root: string): readonly string[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(autopilotDirectory(root));
  } catch {
    return [];
  }

  return entries
    .filter((entry) => RUN_ID.test(entry))
    .filter((entry) => {
      // A directory with no state file is not a run: it is a worktree parent, a
      // half-created run, or something a human left behind.
      try {
        const handle = openSync(join(autopilotDirectory(root), entry, STATE_FILE), 'r');
        const isFile = fstatSync(handle).isFile();
        closeSync(handle);
        return isFile;
      } catch {
        return false;
      }
    })
    .sort();
}
