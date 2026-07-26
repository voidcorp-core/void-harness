export type EvidenceConfidence = 'low' | 'medium' | 'high';
export type EvidenceStatus = 'passed' | 'failed';
export type EvidenceDependencyKind =
  | 'diff'
  | 'input'
  | 'artifact'
  | 'evidence';

export interface EvidenceDependency {
  readonly kind: EvidenceDependencyKind;
  readonly key: string;
  readonly hash: string;
}

export interface EvidenceOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export interface EvidenceEnvironment {
  readonly runtime: string;
  readonly platform: string;
  readonly arch: string;
}

export interface EvidenceDraft {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly missionId: string;
  readonly type: 'command';
  readonly producer: string;
  readonly source: string;
  readonly environment: EvidenceEnvironment;
  readonly confidence: EvidenceConfidence;
  readonly inputHash: string;
  readonly diffHash: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly status: EvidenceStatus;
  readonly exitCode: number;
  readonly command: readonly string[];
  readonly affectedNodes: readonly string[];
  readonly output: EvidenceOutput;
  readonly dependencies: readonly EvidenceDependency[];
}

export interface Evidence extends EvidenceDraft {
  readonly proofHash: string;
}

export type EvidenceParseIssueCode =
  | 'invalid-evidence-contract'
  | 'evidence-integrity-mismatch';

export interface EvidenceParseIssue {
  readonly code: EvidenceParseIssueCode;
  readonly message: string;
}

export type EvidenceParseResult =
  | { readonly ok: true; readonly value: Evidence }
  | { readonly ok: false; readonly issue: EvidenceParseIssue };

export interface EvidenceContext {
  readonly missionId?: string;
  readonly dependencies: Readonly<Record<string, string>>;
}

export interface EvidenceAssessment {
  readonly status: 'fresh' | 'stale' | 'tampered';
  readonly staleDependencies: readonly string[];
}
