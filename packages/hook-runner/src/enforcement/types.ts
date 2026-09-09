export interface NormalizedEdit {
  readonly path: string;
  readonly addedContent: string;
  /** Present only when the patch explicitly removes the entire file. */
  readonly operation?: 'delete';
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
