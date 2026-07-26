// Behavioral analysis (M8): types for the activation stream consumed from
// Canonical/legacy activation projections and their advisory findings. Pure domain.

export type ActivationKind = 'skill' | 'agent' | 'workflow' | 'tool';

export interface ActivationTrigger {
  readonly tool: string;
  readonly fileGlobs: readonly string[];
  readonly ext: readonly string[];
}

export interface ActivationEvent {
  readonly ts: string;
  readonly kind: ActivationKind;
  readonly name: string;
  readonly trigger: ActivationTrigger;
  readonly sessionId: string;
}

export interface BehaviorFinding {
  readonly kind: 'dead-node' | 'should-have-fired' | 'telemetry-gap';
  readonly severity: 'info';
  readonly nodes: readonly string[];
  readonly evidence: string;
  readonly suggestion: string;
  readonly count?: number;
}
