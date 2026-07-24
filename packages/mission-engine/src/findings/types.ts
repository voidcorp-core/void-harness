export type FindingSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';
export type FindingStatus = 'open' | 'resolved' | 'excepted';

export interface FindingException {
  readonly actor: string;
  readonly reason: string;
}

export interface Finding {
  readonly findingId: string;
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly blocking: boolean;
  readonly waivable: boolean;
  readonly evidenceIds: readonly string[];
  readonly status: FindingStatus;
  readonly resolution?: string;
  readonly exception?: FindingException;
}

export type FindingLedgerIssue =
  | {
      readonly code: 'duplicate-finding';
      readonly findingId: string;
    }
  | {
      readonly code: 'unknown-finding-transition';
      readonly findingId: string;
    }
  | {
      readonly code: 'invalid-finding-event';
      readonly eventId: string;
    }
  | {
      readonly code: 'non-waivable-exception';
      readonly findingId: string;
    };

export interface FindingLedger {
  readonly findings: readonly Finding[];
  readonly issues: readonly FindingLedgerIssue[];
}
