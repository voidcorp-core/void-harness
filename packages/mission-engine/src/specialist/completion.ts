export type SpecialistCompletionVerdict =
  | 'pass'
  | 'changes-requested'
  | 'blocked'
  | 'degraded';
export type SpecialistFindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SpecialistEvidence {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

export interface SpecialistFinding {
  readonly id: string;
  readonly severity: SpecialistFindingSeverity;
  readonly summary: string;
  readonly evidence: readonly SpecialistEvidence[];
  readonly recommendation: string;
}

export interface SpecialistCompletion {
  readonly schemaVersion: 1;
  readonly specialistId: `core:${string}`;
  readonly contractVersion: number;
  readonly completionId: string;
  readonly verdict: SpecialistCompletionVerdict;
  readonly findings: readonly SpecialistFinding[];
  readonly evidenceRequests: readonly string[];
  readonly limitations: readonly string[];
}

const SPECIALIST_ID = /^core:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPLETION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const FINDING_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:/;

interface CompletionRecord extends Readonly<Record<string, unknown>> {
  readonly path?: unknown;
  readonly line?: unknown;
  readonly detail?: unknown;
  readonly id?: unknown;
  readonly severity?: unknown;
  readonly summary?: unknown;
  readonly evidence?: unknown;
  readonly recommendation?: unknown;
  readonly schemaVersion?: unknown;
  readonly specialistId?: unknown;
  readonly contractVersion?: unknown;
  readonly completionId?: unknown;
  readonly verdict?: unknown;
  readonly findings?: unknown;
  readonly evidenceRequests?: unknown;
  readonly limitations?: unknown;
}

function record(value: unknown): CompletionRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as CompletionRecord
    : undefined;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.includes('\0')) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function textList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > 16) return undefined;
  const parsed = value.map((item) => boundedText(item, 1_000));
  return parsed.every((item) => item !== undefined) ? parsed as readonly string[] : undefined;
}

function parseEvidence(value: unknown): SpecialistEvidence | undefined {
  const input = record(value);
  if (input === undefined || !exactKeys(input, ['path', 'line', 'detail'])) return undefined;
  const path = input.path;
  const detail = boundedText(input.detail, 1_000);
  if (
    typeof path !== 'string'
    || path.length < 1
    || path.length > 500
    || path.startsWith('/')
    || path.startsWith('\\')
    || WINDOWS_ABSOLUTE.test(path)
    || path.replaceAll('\\', '/').split('/').includes('..')
    || !Number.isSafeInteger(input.line)
    || Number(input.line) < 1
    || Number(input.line) > 10_000_000
    || detail === undefined
  ) {
    return undefined;
  }
  return { path, line: Number(input.line), detail };
}

function parseFinding(value: unknown): SpecialistFinding | undefined {
  const input = record(value);
  if (
    input === undefined
    || !exactKeys(input, ['id', 'severity', 'summary', 'evidence', 'recommendation'])
    || typeof input.id !== 'string'
    || !FINDING_ID.test(input.id)
    || !['critical', 'high', 'medium', 'low'].includes(String(input.severity))
    || !Array.isArray(input.evidence)
    || input.evidence.length < 1
    || input.evidence.length > 16
  ) {
    return undefined;
  }
  const summary = boundedText(input.summary, 500);
  const recommendation = boundedText(input.recommendation, 1_000);
  const evidence = input.evidence.map(parseEvidence);
  if (
    summary === undefined
    || recommendation === undefined
    || evidence.some((item) => item === undefined)
  ) {
    return undefined;
  }
  return {
    id: input.id,
    severity: input.severity as SpecialistFindingSeverity,
    summary,
    evidence: evidence as readonly SpecialistEvidence[],
    recommendation,
  };
}

/** Parse the one canonical specialist completion contract used by every invocation path. */
export function parseSpecialistCompletionValue(input: unknown): SpecialistCompletion | undefined {
  const value = record(input);
  if (
    value === undefined
    || !exactKeys(value, [
      'schemaVersion',
      'specialistId',
      'contractVersion',
      'completionId',
      'verdict',
      'findings',
      'evidenceRequests',
      'limitations',
    ])
    || value.schemaVersion !== 1
    || typeof value.specialistId !== 'string'
    || !SPECIALIST_ID.test(value.specialistId)
    || !Number.isSafeInteger(value.contractVersion)
    || Number(value.contractVersion) < 1
    || Number(value.contractVersion) > 10_000
    || typeof value.completionId !== 'string'
    || !COMPLETION_ID.test(value.completionId)
    || !['pass', 'changes-requested', 'blocked', 'degraded'].includes(String(value.verdict))
    || !Array.isArray(value.findings)
    || value.findings.length > 32
  ) {
    return undefined;
  }
  const findings = value.findings.map(parseFinding);
  const evidenceRequests = textList(value.evidenceRequests);
  const limitations = textList(value.limitations);
  if (
    findings.some((item) => item === undefined)
    || evidenceRequests === undefined
    || limitations === undefined
    || (
      (value.verdict === 'blocked' || value.verdict === 'degraded')
      && limitations.length === 0
    )
    || (
      findings.some((finding) => finding?.severity === 'critical')
      && value.verdict !== 'blocked'
    )
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    specialistId: value.specialistId as `core:${string}`,
    contractVersion: Number(value.contractVersion),
    completionId: value.completionId,
    verdict: value.verdict as SpecialistCompletionVerdict,
    findings: findings as readonly SpecialistFinding[],
    evidenceRequests,
    limitations,
  };
}
