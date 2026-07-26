import type {
  DecisionIssue,
  DecisionRecord,
} from './types.js';

function duplicateIssues(
  records: readonly DecisionRecord[],
): readonly DecisionIssue[] {
  const firstFile = new Map<string, string>();
  const issues: DecisionIssue[] = [];
  for (const record of records) {
    const first = firstFile.get(record.id);
    if (first !== undefined) {
      issues.push({
        code: 'duplicate-id',
        file: record.file,
        message: `decision id '${record.id}' is already declared by ${first}`,
      });
    } else {
      firstFile.set(record.id, record.file);
    }
  }
  return issues;
}

function missingSupersedesIssues(
  records: readonly DecisionRecord[],
): readonly DecisionIssue[] {
  const ids = new Set(records.map((record) => record.id));
  const issues: DecisionIssue[] = [];
  for (const record of records) {
    for (const target of record.supersedes) {
      if (!ids.has(target)) {
        issues.push({
          code: 'missing-superseded-decision',
          file: record.file,
          message: `supersedes unknown decision '${target}'`,
        });
      }
    }
  }
  return issues;
}

function participatesInCycle(
  start: string,
  edges: ReadonlyMap<string, readonly string[]>,
): boolean {
  const pending = [...(edges.get(start) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (current === start) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(edges.get(current) ?? []));
  }
  return false;
}

function cycleIssues(
  records: readonly DecisionRecord[],
): readonly DecisionIssue[] {
  const edges = new Map(
    records.map((record) => [record.id, record.supersedes] as const),
  );
  return records
    .filter((record) => participatesInCycle(record.id, edges))
    .map((record) => ({
      code: 'supersession-cycle' as const,
      file: record.file,
      message: `decision '${record.id}' participates in a supersession cycle`,
    }));
}

export function validateDecisions(
  records: readonly DecisionRecord[],
): readonly DecisionIssue[] {
  return [
    ...duplicateIssues(records),
    ...missingSupersedesIssues(records),
    ...cycleIssues(records),
  ];
}
