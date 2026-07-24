interface ToolOutput {
  readonly tool: string;
  readonly text: string;
}

export interface OutputTrimOptions {
  readonly tool: string;
  readonly thresholdBytes: number;
  readonly spillPath: string;
}

export interface OutputTrimPlan {
  readonly fullOutput: string;
  readonly originalBytes: number;
  readonly updatedToolOutput: string;
  readonly note: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      const block = record(item);
      return typeof block?.['text'] === 'string' ? block['text'] : '';
    })
    .filter((item) => item !== '')
    .join('\n');
}

function responseText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return contentText(value);
  const response = record(value);
  if (response === undefined) return '';
  return [
    response['stdout'],
    response['stderr'],
    response['output'],
    response['result'],
    contentText(response['content']),
  ]
    .filter((item): item is string => typeof item === 'string' && item !== '')
    .join('\n');
}

export function extractToolOutput(value: unknown): ToolOutput | undefined {
  const raw = record(value);
  if (raw === undefined) return undefined;
  const tool = raw['tool_name'];
  if (
    typeof tool !== 'string'
    || (tool !== 'Bash' && tool !== 'shell' && !tool.startsWith('mcp__'))
  ) {
    return undefined;
  }
  const text = responseText(raw['tool_response']);
  return text === '' ? undefined : { tool, text };
}

function errorEvidence(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) =>
      /error|fail|exception|traceback|fatal|panic|not ok|assert/i.test(line),
    )
    .join('\n')
    .slice(0, 1_500);
}

export function planOutputTrim(
  text: string,
  options: OutputTrimOptions,
): OutputTrimPlan | undefined {
  const originalBytes = Buffer.byteLength(text, 'utf8');
  if (originalBytes <= options.thresholdBytes) return undefined;
  const head = text.slice(0, 3_000);
  const tail = text.slice(-3_000);
  const errors = errorEvidence(text);
  const updatedToolOutput =
    `${head}\n\n[trimmed ${originalBytes} bytes. Full output: ${options.spillPath}]\n\n` +
    `${tail}\n\n[error-like lines]\n${errors}\n`;
  return {
    fullOutput: text,
    originalBytes,
    updatedToolOutput,
    note:
      `trim-large-output: ${options.tool} result ${originalBytes}B trimmed; ` +
      `full output at ${options.spillPath}`,
  };
}
