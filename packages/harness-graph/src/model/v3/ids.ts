import { createHash } from 'node:crypto';

const SEGMENT = /^[a-z][a-z0-9-]{0,63}$/;
const LOGICAL = /^[A-Za-z0-9._~:/-]{1,256}$/;

function segment(value: string, field: string): string {
  if (!SEGMENT.test(value)) {
    throw new Error(`GRAPH_ID_INVALID: ${field} must be a lower-case namespace segment`);
  }
  return value;
}

function logical(value: string): string {
  if (LOGICAL.test(value) && !value.includes('..')) return value;
  return `h-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export function graphEntityId(namespace: string, kind: string, logicalKey: string): string {
  return `${segment(namespace, 'namespace')}:${segment(kind, 'kind')}:${logical(logicalKey)}`;
}

export function graphRelationId(
  namespace: string,
  kind: string,
  logicalMembers: readonly string[],
): string {
  segment(namespace, 'namespace');
  segment(kind, 'kind');
  if (logicalMembers.length < 2 || logicalMembers.some((member) => member.length === 0)) {
    throw new Error('GRAPH_ID_INVALID: a relation requires at least two logical members');
  }
  const digest = createHash('sha256')
    .update(JSON.stringify([kind, ...logicalMembers]))
    .digest('hex')
    .slice(0, 32);
  return `${namespace}:edge:${kind}:${digest}`;
}
