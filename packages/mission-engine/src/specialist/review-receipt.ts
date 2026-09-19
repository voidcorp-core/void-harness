/** Durable subject and provenance of a read-only review, independent of runtime ID syntax. */
export interface ReviewSubject {
  readonly taskId: string;
  readonly baseCommit: string;
  readonly reviewedCommit: string;
  readonly acceptanceCriteriaHash: string;
}
export type ReviewScope =
  | { readonly kind: 'general' }
  | { readonly kind: 'targeted'; readonly findingIds: readonly string[]; readonly affectedPaths: readonly string[] };
export type ReviewProvenance =
  | { readonly kind: 'native-context'; readonly contextId: string }
  | { readonly kind: 'review-artifact'; readonly path: string; readonly sha256: string; readonly limitation: string };
export interface IndependentReviewReceipt extends ReviewSubject {
  readonly reviewerId: string;
  readonly writerId: string;
  readonly readOnly: true;
  readonly scope: ReviewScope;
  readonly proofIds: readonly string[];
  readonly resolutions: readonly {
    readonly findingId: string;
    readonly status: 'resolved' | 'unresolved';
    readonly proofIds: readonly string[];
  }[];
  readonly provenance: ReviewProvenance;
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => key in value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1_000 && !value.includes('\0');
}
function texts(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 64 && value.every(text)
    && new Set(value).size === value.length;
}
function path(value: unknown): value is string {
  return text(value) && value.length <= 500 && !/^(?:[A-Za-z]:|[/\\])/.test(value)
    && !value.replaceAll('\\', '/').split('/').includes('..');
}
export function isReviewSubject(value: unknown): value is ReviewSubject {
  return record(value) && text(value['taskId'])
    && typeof value['baseCommit'] === 'string' && /^[a-f0-9]{40,64}$/.test(value['baseCommit'])
    && typeof value['reviewedCommit'] === 'string' && /^[a-f0-9]{40,64}$/.test(value['reviewedCommit'])
    && typeof value['acceptanceCriteriaHash'] === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(value['acceptanceCriteriaHash']);
}
export function isReviewScope(value: unknown): value is ReviewScope {
  if (!record(value)) return false;
  if (value['kind'] === 'general') return exact(value, ['kind']);
  return value['kind'] === 'targeted' && exact(value, ['kind', 'findingIds', 'affectedPaths'])
    && texts(value['findingIds']) && texts(value['affectedPaths']) && value['affectedPaths'].every(path);
}
function provenance(value: unknown): value is ReviewProvenance {
  if (!record(value)) return false;
  if (value['kind'] === 'native-context') return exact(value, ['kind', 'contextId']) && text(value['contextId']);
  return value['kind'] === 'review-artifact' && exact(value, ['kind', 'path', 'sha256', 'limitation'])
    && path(value['path']) && typeof value['sha256'] === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(value['sha256']) && text(value['limitation']);
}
function receipt(value: unknown): value is IndependentReviewReceipt {
  if (!record(value) || !exact(value, ['taskId', 'baseCommit', 'reviewedCommit', 'acceptanceCriteriaHash',
    'reviewerId', 'writerId', 'readOnly', 'scope', 'proofIds', 'resolutions', 'provenance'])
    || !isReviewSubject(value) || !text(value['reviewerId']) || !text(value['writerId'])
    || value['reviewerId'] === value['writerId'] || value['readOnly'] !== true
    || !isReviewScope(value['scope']) || !texts(value['proofIds']) || !provenance(value['provenance'])
    || !Array.isArray(value['resolutions']) || value['resolutions'].length > 64) return false;
  return value['resolutions'].every(item => record(item)
    && exact(item, ['findingId', 'status', 'proofIds']) && text(item['findingId'])
    && (item['status'] === 'resolved' || item['status'] === 'unresolved') && texts(item['proofIds'])
    && (item['status'] !== 'resolved' || item['proofIds'].length > 0));
}
export function parseReviewReceipt(value: unknown): IndependentReviewReceipt | undefined {
  return receipt(value) ? value : undefined;
}
export function sameReviewSubject(left: ReviewSubject, right: ReviewSubject): boolean {
  return left.taskId === right.taskId && left.baseCommit === right.baseCommit
    && left.reviewedCommit === right.reviewedCommit
    && left.acceptanceCriteriaHash === right.acceptanceCriteriaHash;
}
