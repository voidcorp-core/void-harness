function fail(message) {
  throw new Error(`auto-merge is not canonical: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function assertCanonicalAutoMerge(pr, expected) {
  if (!isObject(pr) || !isObject(expected)) fail('input is missing');
  if (
    typeof expected.repository !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[A-Za-z0-9_.-]+$/.test(expected.repository)
  ) {
    fail('expected repository is invalid');
  }
  if (typeof expected.head !== 'string' || expected.head === '') fail('expected head is invalid');
  if (typeof expected.base !== 'string' || expected.base === '') fail('expected base is invalid');
  if (pr.autoMergeRequest === null) return 'unarmed';
  if (!isObject(pr.autoMergeRequest)) fail('auto-merge state is malformed');

  const owner = expected.repository.split('/')[0];
  if (
    pr.baseRefName !== expected.base ||
    pr.headRefName !== expected.head ||
    pr.headRepository?.nameWithOwner !== expected.repository ||
    pr.headRepositoryOwner?.login !== owner ||
    pr.isCrossRepository !== false
  ) {
    fail('pull request identity does not match the canonical back-merge');
  }
  return 'canonical';
}
