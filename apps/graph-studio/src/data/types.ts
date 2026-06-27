export interface UsageSummary {
  readonly counts: Record<string, number>;
  readonly usedSkillNames: readonly string[];
}

export interface WorkflowPhase {
  readonly title: string;
  readonly detail?: string;
}

export interface WorkflowMeta {
  readonly phases: readonly WorkflowPhase[];
}
