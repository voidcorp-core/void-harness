export const DECISION_STATUSES = [
  'proposed',
  'accepted',
  'deprecated',
  'superseded',
] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface DecisionRecord {
  readonly schemaVersion: 1 | undefined;
  readonly id: string;
  readonly createdAt: string;
  readonly title: string;
  readonly status: DecisionStatus;
  readonly deciders: readonly string[];
  readonly supersedes: readonly string[];
  readonly body: string;
  readonly file: string;
  readonly legacy: boolean;
}

export type DecisionIssueCode =
  | 'invalid-frontmatter'
  | 'invalid-yaml'
  | 'invalid-v3-contract'
  | 'invalid-legacy-contract'
  | 'unsafe-decision-directory'
  | 'unsafe-decision-file'
  | 'decision-file-too-large'
  | 'duplicate-id'
  | 'missing-superseded-decision'
  | 'supersession-cycle'
  | 'accepted-decision-modified'
  | 'accepted-decision-deleted'
  | 'accepted-decision-renamed'
  | 'git-base-invalid'
  | 'git-check-failed';

export interface DecisionIssue {
  readonly code: DecisionIssueCode;
  readonly file: string;
  readonly message: string;
}

export type DecisionParseResult =
  | { readonly ok: true; readonly value: DecisionRecord }
  | { readonly ok: false; readonly issues: readonly DecisionIssue[] };

export interface LoadedDecisions {
  readonly directory: string;
  readonly records: readonly DecisionRecord[];
  readonly issues: readonly DecisionIssue[];
}
