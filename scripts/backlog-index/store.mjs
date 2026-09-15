// fs open(wx), rename and fsync: Node 24.15 official API.
// https://nodejs.org/download/release/v24.15.0/docs/api/fs.html
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkState, reconcile, render } from './model.mjs';
import { readBounded } from './read.mjs';
import { maxBytes, requireValue } from './schema.mjs';

function regular(path, kind) {
  const stat = lstatSync(path);
  requireValue(kind === 'directory' ? stat.isDirectory() : stat.isFile(), `Unsafe ${kind} path`);
  return stat;
}
function directory(path) {
  const target = resolve(path);
  if (dirname(target) !== target) directory(dirname(target));
  if (!existsSync(target)) mkdirSync(target, { mode: 0o700 });
  regular(target, 'directory');
}
function inspectAncestors(path) {
  const target = resolve(path);
  if (dirname(target) !== target) inspectAncestors(dirname(target));
  if (existsSync(target)) regular(target, 'directory');
}
function syncDirectory(path) {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function write(path, body) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, body); fsyncSync(fd); } finally { closeSync(fd); }
}
export function readCurrent(root) {
  inspectAncestors(root);
  const pointer = join(root, 'INDEX.md');
  if (!existsSync(pointer)) return undefined;
  regular(pointer, 'file');
  const match = /^<!-- backlog-generation: ([a-f0-9]{64}) -->\n/.exec(readBounded(pointer, 4096));
  requireValue(match, 'Unrecognized INDEX.md; archive the prior manual entry before importing');
  const generation = join(root, 'generations', match[1]);
  regular(join(root, 'generations'), 'directory');
  regular(generation, 'directory');
  const file = join(generation, 'state.json');
  requireValue(regular(file, 'file').size <= maxBytes, 'Baseline too large');
  const state = checkState(JSON.parse(readBounded(file, maxBytes)));
  requireValue(state.digest === match[1], 'Baseline generation mismatch');
  return state;
}
export function publish(root, input) {
  directory(root);
  const lock = join(root, '.writer');
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Index writer occupied. Inspect .writer; never steal a live writer lock.');
    throw error;
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    const state = reconcile(input, readCurrent(root));
    const files = render(state);
    const generations = join(root, 'generations');
    directory(generations);
    const destination = join(generations, state.digest);
    if (!existsSync(destination)) {
      const stage = mkdtempSync(join(generations, '.pending-'));
      directory(join(stage, 'tickets'));
      for (const [name, body] of Object.entries(files)) write(join(stage, name), body);
      syncDirectory(join(stage, 'tickets'));
      syncDirectory(stage);
      renameSync(stage, destination);
      syncDirectory(generations);
    }
    regular(destination, 'directory');
    regular(join(destination, 'tickets'), 'directory');
    for (const [name, body] of Object.entries(files)) {
      const file = join(destination, name);
      regular(file, 'file');
      requireValue(readBounded(file, Math.max(maxBytes, Buffer.byteLength(body))) === body,
        'Corrupt generation; preserve it and re-export');
    }
    // A new staging directory avoids overwriting a residue from an interrupted publication.
    const stage = mkdtempSync(join(root, '.publish-'));
    const temporary = join(stage, 'INDEX.md');
    write(temporary, `<!-- backlog-generation: ${state.digest} -->\n# Index Linear source\n\n`
      + `[Ouvrir l’index complet](generations/${state.digest}/INDEX.md)\n\n`
      + `Relevé complet : ${state.fullCapturedAt}. Actualisation : ${state.capturedAt}.\n\n`
      + 'Maintenance locale uniquement. Relire Linear avant action.\n');
    renameSync(temporary, join(root, 'INDEX.md'));
    syncDirectory(root);
    rmdirSync(stage);
    return state;
  } finally { closeSync(fd); unlinkSync(lock); }
}
