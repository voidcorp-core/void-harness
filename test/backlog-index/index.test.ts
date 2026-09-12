import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectId, reconcile, render } from '../../scripts/backlog-index/model.mjs';
import { publish, readCurrent } from '../../scripts/backlog-index/store.mjs';
import { maxBytes } from '../../scripts/backlog-index/schema.mjs';

const date = '2026-09-12T12:00:00.000Z';
function issue(id = 'DEV-1') {
  return { id, projectId, title: 'Projet autonome après retrait', status: 'Backlog',
    updatedAt: date, description: 'Retirer .void/ sans casser le projet.',
    relations: { relatedTo: ['DEV-2'] }, comments: [
      { id: 'comment-1', body: 'Ancienne proposition <script>alert(1)</script>',
        author: 'Maintainer', createdAt: date, updatedAt: date },
    ] };
}
function batch(issues = [issue()]) {
  return { schemaVersion: 1, projectId, mode: 'full', capturedAt: date,
    coverage: { issuesComplete: true, commentsComplete: true, unfiltered: true },
    issues, removals: [] };
}

describe('source backlog projection', () => {
  it('preserves discussion, safe text and chronological provenance deterministically', () => {
    const input = batch([issue('DEV-2'), issue()]);
    const a = reconcile(input);
    const b = reconcile({ ...input, issues: [...input.issues].reverse() });
    expect(render(a)).toEqual(render(b));
    expect(render(a)['tickets/DEV-1.md']).toContain('&lt;script&gt;');
    expect(render(a)['INDEX.md']).toContain('autonomie');
    expect(render(a)['INDEX.md']).toContain('DEV-2');
  });

  it.each([
    ['foreign project', { projectId: 'foreign' }],
    ['incomplete comments', { coverage: { issuesComplete: true, commentsComplete: false, unfiltered: true } }],
    ['filtered inventory', { coverage: { issuesComplete: true, commentsComplete: true, unfiltered: false } }],
    ['duplicate issues', { issues: [issue(), issue()] }],
    ['unsafe identifier', { issues: [issue('../elsewhere')] }],
    ['foreign issue', { issues: [{ ...issue(), projectId: 'foreign' }] }],
    ['duplicate comments', { issues: [{ ...issue(), comments: [issue().comments[0], issue().comments[0]] }] }],
    ['bad date', { capturedAt: 'tomorrow' }],
    ['incomplete description', { issues: [{ ...issue(), description: undefined }] }],
  ])('refuses %s', (_name, patch) => {
    expect(() => reconcile({ ...batch(), ...patch })).toThrow();
  });

  it('requires complete baseline, preserves global freshness and untouched tickets on increment', () => {
    const prior = reconcile(batch([issue(), issue('DEV-2')]));
    const update = { ...batch([{ ...issue(), title: 'Corrected' }]), mode: 'incremental',
      capturedAt: '2026-09-13T12:00:00.000Z', baseDigest: prior.digest };
    expect(() => reconcile(update)).toThrow(/baseline/i);
    const next = reconcile(update, prior);
    expect(next.fullCapturedAt).toBe(date);
    expect(next.issues).toHaveLength(2);
    expect(next.issues[1].observedAt).toBe(date);
    expect(next.issues[0].title).toBe('Corrected');
    expect(() => reconcile({ ...update, baseDigest: 'stale' }, next)).toThrow(/baseline/i);
  });

  it('refuses unexplained disappearance and stale capture; only full reconciliation removes', () => {
    const prior = reconcile(batch([issue(), issue('DEV-2')]));
    expect(() => reconcile(batch(), prior)).toThrow(/removal/i);
    const update = { ...batch(), removals: [{ id: 'DEV-2', reason: 'moved-out-of-project' }] };
    expect(reconcile(update, prior).issues).toHaveLength(1);
    expect(() => reconcile({ ...update, mode: 'incremental', baseDigest: prior.digest }, prior)).toThrow();
    expect(() => reconcile({ ...batch(), capturedAt: '2026-09-11T12:00:00.000Z' }, prior)).toThrow();
  });

  it('keeps the published generation intact on invalid imports and competing writers', () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'backlog-index-'));
    publish(root, batch());
    const before = readFileSync(join(root, 'INDEX.md'), 'utf8');
    expect(() => publish(root, { ...batch(), coverage: {} })).toThrow();
    expect(readFileSync(join(root, 'INDEX.md'), 'utf8')).toBe(before);
    writeFileSync(join(root, '.writer'), 'occupied');
    expect(() => publish(root, batch())).toThrow(/writer/i);
    expect(readCurrent(root).issues).toHaveLength(1);
    expect(readFileSync(join(root, 'INDEX.md'), 'utf8')).toBe(before);
  });

  it('detects corrupted persisted state rather than using a cached success', () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'backlog-index-'));
    const state = publish(root, batch());
    writeFileSync(join(root, 'generations', state.digest, 'state.json'), '{}');
    expect(() => readCurrent(root)).toThrow();
  });

  it('rejects older issue and comment revisions even with a newer observation date', () => {
    const prior = reconcile(batch());
    const older = '2026-09-11T12:00:00.000Z';
    expect(() => reconcile(batch([{ ...issue(), updatedAt: older }]), prior)).toThrow(/revision/);
    const changed = { ...issue(), comments: [{ ...issue().comments[0], updatedAt: older }] };
    expect(() => reconcile({ ...batch([changed]), mode: 'incremental', baseDigest: prior.digest }, prior)).toThrow(/revision/);
  });

  it('refuses a merged corpus larger than its reader can load', () => {
    const large = (id: string) => ({ ...issue(id), comments: Array.from({ length: 90 }, (_, n) => ({
      ...issue().comments[0], id: `c-${n}`, body: 'x'.repeat(199_000),
    })) });
    const prior = reconcile(batch([large('DEV-1')]));
    expect(() => reconcile({ ...batch([large('DEV-2')]), mode: 'incremental', baseDigest: prior.digest }, prior)).toThrow(/large/);
  });

  it('rejects dangling replies and orders distinct Unicode ids without locale equivalence', () => {
    const first = { ...issue().comments[0], id: 'Å' };
    const second = { ...first, id: 'Å' };
    const forward = batch([{ ...issue(), comments: [first, second] }]);
    const reverse = batch([{ ...issue(), comments: [second, first] }]);
    expect(reconcile(forward).digest).toBe(reconcile(reverse).digest);
    expect(() => reconcile(batch([{ ...issue(), comments: [{ ...first, parentId: 'missing' }] }]))).toThrow(/reply/);
  });

  it('refuses symlink ancestors during baseline reads as well as publication', () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'backlog-path-'));
    const outside = join(root, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(root, 'redirect'), 'dir');
    expect(() => readCurrent(join(root, 'redirect/index'))).toThrow(/Unsafe/);
    expect(() => publish(join(root, 'redirect/index'), batch())).toThrow(/Unsafe/);
  });

  it('includes the persisted newline in the exact size boundary', () => {
    const comments = Array.from({ length: 168 }, (_, n) => ({
      ...issue().comments[0], id: `c-${n}`, body: n === 167 ? '' : 'x'.repeat(200_000),
    }));
    const input = batch([{ ...issue(), comments }]);
    const initial = reconcile(input);
    comments[167].body = 'x'.repeat(maxBytes - Buffer.byteLength(JSON.stringify(initial, undefined, 2)));
    expect(() => reconcile(input)).toThrow(/large/);
  });

  it('rejects timezone-less dates and cyclic reply ancestry', () => {
    expect(() => reconcile({ ...batch(), capturedAt: '2026-09-12T12:00:00' })).toThrow(/date/);
    const a = { ...issue().comments[0], id: 'a', parentId: 'b' };
    const b = { ...a, id: 'b', parentId: 'a' };
    expect(() => reconcile(batch([{ ...issue(), comments: [a, b] }]))).toThrow(/reply/);
  });
});
