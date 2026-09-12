// Bounded maintenance-only JSON exchange. No provider credentials or executable fields.
export const projectId = 'e17b2f59-54b2-46aa-bb69-0c21434819f3';
export const maxBytes = 32 * 1024 * 1024;
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const serialize = (value) => `${JSON.stringify(value, undefined, 2)}\n`;
export function requireValue(condition, message) {
  if (!condition) throw new Error(`${message}. Re-export the complete scoped data; keep the prior index.`);
}
function text(value, name, max = 200_000) {
  requireValue(typeof value === 'string' && value.length <= max, `Invalid ${name}`);
  return value;
}
export function date(value) {
  requireValue(typeof value === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value)), 'Invalid observation date');
  requireValue(new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10), 'Invalid calendar date');
  return new Date(value).toISOString();
}
export function identifier(value) {
  requireValue(typeof value === 'string' && /^DEV-[1-9]\d{0,8}$/.test(value), 'Invalid issue identifier');
  return value;
}
export function list(value, name, max = 10_000) {
  requireValue(Array.isArray(value) && value.length <= max, `Invalid ${name}`);
  return value;
}
export function unique(values, name) {
  requireValue(new Set(values).size === values.length, `Duplicate ${name}`);
}
function comment(value) {
  requireValue(value && typeof value === 'object', 'Invalid comment');
  return { id: text(value.id, 'comment id', 200), body: text(value.body, 'comment body'),
    author: text(value.author, 'author', 500), createdAt: date(value.createdAt),
    updatedAt: date(value.updatedAt), parentId: text(value.parentId ?? '', 'reply id', 200),
    quotedText: text(value.quotedText ?? '', 'quoted text') };
}
function validateReplies(comments) {
  const parents = new Map(comments.map((c) => [c.id, c.parentId]));
  const checked = new Set();
  for (const c of comments) {
    const path = new Set();
    let id = c.id;
    while (id && !checked.has(id)) {
      requireValue(parents.has(id) && !path.has(id), 'Invalid reply ancestry');
      path.add(id);
      id = parents.get(id);
    }
    for (const visited of path) checked.add(visited);
  }
}
export function issue(value, observedAt) {
  requireValue(value?.projectId === projectId, 'Foreign issue project');
  const comments = list(value.comments, 'comments').map(comment);
  unique(comments.map((c) => c.id), 'comment');
  const ids = new Set(comments.map((c) => c.id));
  for (const c of comments) {
    requireValue(c.id.length > 0 && (!c.parentId || (ids.has(c.parentId) && c.parentId !== c.id)), 'Invalid reply reference');
  }
  validateReplies(comments);
  comments.sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
  const relations = {};
  requireValue(value.relations && typeof value.relations === 'object', 'Missing relations');
  for (const key of Object.keys(value.relations).sort()) {
    requireValue(['blocks', 'blockedBy', 'relatedTo', 'duplicateOf', 'parent'].includes(key), 'Unknown relation');
    relations[key] = list(value.relations[key], 'relations').map(identifier).sort();
    unique(relations[key], 'relation');
  }
  return { id: identifier(value.id), projectId, title: text(value.title, 'title', 2000),
    status: text(value.status, 'status', 100), updatedAt: date(value.updatedAt),
    description: text(value.description, 'description'), relations, comments, observedAt };
}
export function validate(input) {
  requireValue(Buffer.byteLength(JSON.stringify(input) ?? '') <= maxBytes, 'Export too large (32 MiB max)');
  requireValue(input?.schemaVersion === 1 && input.projectId === projectId, 'Wrong schema or project');
  requireValue(['full', 'incremental'].includes(input.mode), 'Invalid mode');
  requireValue(input.coverage?.issuesComplete === true && input.coverage?.commentsComplete === true
    && input.coverage?.unfiltered === true, 'Incomplete or filtered export');
  const capturedAt = date(input.capturedAt);
  const issues = list(input.issues, 'issues').map((value) => issue(value, capturedAt));
  unique(issues.map((i) => i.id), 'issue');
  const removals = list(input.removals, 'removals').map((r) => {
    requireValue(['confirmed-deleted', 'moved-out-of-project'].includes(r.reason), 'Unconfirmed removal');
    return { id: identifier(r.id), reason: r.reason };
  });
  unique(removals.map((r) => r.id), 'removal');
  return { schemaVersion: 1, projectId, mode: input.mode, capturedAt, issues, removals,
    baseDigest: input.baseDigest };
}
