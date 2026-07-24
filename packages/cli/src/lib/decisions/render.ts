import type { DecisionRecord } from './types.js';

function sorted(records: readonly DecisionRecord[]): readonly DecisionRecord[] {
  return [...records].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.file < right.file ? 1 : -1;
  });
}

function metadata(record: DecisionRecord): Record<string, unknown> {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    status: record.status,
    deciders: record.deciders,
    supersedes: record.supersedes,
    file: record.file,
    legacy: record.legacy,
  };
}

export function renderDecisionsJson(
  records: readonly DecisionRecord[],
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      decisions: sorted(records).map(metadata),
    },
    null,
    2,
  )}\n`;
}

export function renderDecisionsMarkdown(
  records: readonly DecisionRecord[],
): string {
  const lines = [
    '# Decisions',
    '',
    '> Generated view only. Source of truth: one Markdown file per decision.',
    '',
  ];
  for (const record of sorted(records)) {
    lines.push(
      `- [${record.title}](${record.file}) - ${record.status} - ${record.createdAt} - \`${record.id}\``,
    );
  }
  return `${lines.join('\n')}\n`;
}
