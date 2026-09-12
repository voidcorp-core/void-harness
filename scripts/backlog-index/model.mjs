import { createHash } from 'node:crypto';
import { compare, date, issue, list, maxBytes, projectId, requireValue, serialize, unique, validate } from './schema.mjs';
export { projectId } from './schema.mjs';
export { render } from './render.mjs';

export function digest(state) {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}
function seal(state) {
  const sealed = { ...state, digest: digest(state) };
  requireValue(Buffer.byteLength(serialize(sealed)) <= maxBytes, 'Baseline too large');
  return sealed;
}
export function checkState(value) {
  requireValue(value?.schemaVersion === 1 && value.projectId === projectId, 'Invalid baseline');
  const issues = list(value.issues, 'baseline issues').map((i) => issue(i, date(i.observedAt)));
  unique(issues.map((i) => i.id), 'baseline issue');
  const state = seal({ schemaVersion: 1, projectId,
    fullCapturedAt: date(value.fullCapturedAt), capturedAt: date(value.capturedAt),
    issues: issues.sort((a, b) => compare(a.id, b.id)) });
  requireValue(state.digest === value.digest, 'Corrupt baseline digest');
  return state;
}
export function reconcile(raw, previous) {
  const input = validate(raw);
  const prior = previous ? checkState(previous) : undefined;
  requireValue(!prior || input.capturedAt >= prior.capturedAt, 'Stale capture');
  const oldIssues = new Map((prior?.issues ?? []).map((i) => [i.id, i]));
  for (const item of input.issues) {
    const old = oldIssues.get(item.id);
    requireValue(!old || item.updatedAt >= old.updatedAt, 'Stale issue revision');
    const oldComments = new Map((old?.comments ?? []).map((c) => [c.id, c]));
    for (const c of item.comments) {
      const previousComment = oldComments.get(c.id);
      requireValue(!previousComment || c.updatedAt >= previousComment.updatedAt, 'Stale comment revision');
    }
  }
  let issues = input.issues;
  if (input.mode === 'incremental') {
    requireValue(prior && input.baseDigest === prior.digest, 'Missing or stale baseline');
    requireValue(input.removals.length === 0, 'Incremental removal forbidden');
    const merged = new Map(prior.issues.map((i) => [i.id, i]));
    for (const item of issues) {
      const old = merged.get(item.id);
      requireValue(!old || item.updatedAt >= old.updatedAt, 'Stale issue revision');
      merged.set(item.id, item);
    }
    issues = [...merged.values()];
  } else {
    const ids = new Set(issues.map((i) => i.id));
    const missing = (prior?.issues ?? []).filter((i) => !ids.has(i.id)).map((i) => i.id).sort();
    requireValue(JSON.stringify(missing) === JSON.stringify(input.removals.map((r) => r.id).sort()),
      'Unexplained removal (confirm deletion or project move in full export)');
  }
  requireValue(issues.length <= 10_000, 'Merged corpus too large');
  return seal({ schemaVersion: 1, projectId,
    fullCapturedAt: input.mode === 'full' ? input.capturedAt : prior.fullCapturedAt,
    capturedAt: input.capturedAt,
    issues: issues.sort((a, b) => compare(a.id, b.id)) });
}
