export interface NormalizedEdit {
  readonly path: string;
  readonly addedContent: string;
}

export interface NormalizedToolCall {
  readonly tool: string;
  readonly command: string;
  readonly edits: readonly NormalizedEdit[];
}

export interface RuleVerdict {
  readonly allow: boolean;
  readonly code: string;
  readonly message: string;
  readonly evidence: readonly string[];
}
