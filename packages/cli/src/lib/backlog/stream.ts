// Parse Claude Code's `--output-format stream-json` (one JSON object per line)
// plus the worker's machine-readable markers into the domain events the live
// renderer and the run summary consume.
//
// Two signal sources, by design:
//   - Mechanical, free from the stream envelope: tool_use blocks (Skill, Edit,
//     Write, Bash) and the session lifecycle (init, result).
//   - Semantic, emitted by the worker as text markers the JSON can't infer:
//       VOID_EVENT: PHASE <name>
//       VOID_EVENT: DECISION <text>
//       VOID_AUTONOMOUS_RESULT: <COMPLETED|BLOCKED|NO_TICKETS> [ticket] [detail]
//
// The envelope schema is owned by Claude Code and can shift between versions;
// the fixture (./fixtures/iteration.stream.jsonl) is distilled from a real
// capture. Unknown event types and malformed lines are dropped, never thrown.

export type ResultStatus = 'completed' | 'blocked' | 'no_tickets';

export type BacklogEvent =
  | { readonly kind: 'init'; readonly model?: string }
  | { readonly kind: 'phase'; readonly phase: string }
  | { readonly kind: 'decision'; readonly text: string }
  | { readonly kind: 'skill'; readonly name: string }
  | { readonly kind: 'edit'; readonly path?: string }
  | { readonly kind: 'bash'; readonly command?: string }
  | { readonly kind: 'commit'; readonly subject?: string }
  | { readonly kind: 'tool'; readonly name: string }
  | { readonly kind: 'result'; readonly status: ResultStatus; readonly ticket?: string; readonly detail?: string }
  | { readonly kind: 'session-end'; readonly isError: boolean; readonly costUsd?: number }
  | { readonly kind: 'unknown' };

interface ContentBlock {
  readonly type?: string;
  readonly text?: string;
  readonly name?: string;
  readonly input?: Record<string, unknown>;
}

interface StreamLine {
  readonly type?: string;
  readonly subtype?: string;
  readonly model?: string;
  readonly is_error?: boolean;
  readonly total_cost_usd?: number;
  readonly message?: { readonly content?: readonly ContentBlock[] };
}

const RESULT_STATUS: Record<string, ResultStatus> = {
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  NO_TICKETS: 'no_tickets',
};

/** Pull PHASE / DECISION / RESULT markers out of one assistant text block. */
function eventsFromText(text: string): BacklogEvent[] {
  const out: BacklogEvent[] = [];
  for (const raw of text.split('\n')) {
    const lineText = raw.trim();

    const phase = /^VOID_EVENT:\s*PHASE\s+(.+)$/.exec(lineText);
    if (phase?.[1] !== undefined) {
      out.push({ kind: 'phase', phase: phase[1].trim() });
      continue;
    }

    const decision = /^VOID_EVENT:\s*DECISION\s+(.+)$/.exec(lineText);
    if (decision?.[1] !== undefined) {
      out.push({ kind: 'decision', text: decision[1].trim() });
      continue;
    }

    const result = /^VOID_AUTONOMOUS_RESULT:\s*([A-Z_]+)(?:\s+(\S+))?(?:\s+(.+))?$/.exec(lineText);
    if (result?.[1] !== undefined) {
      const status = RESULT_STATUS[result[1]];
      if (status === 'no_tickets') {
        out.push({ kind: 'result', status });
      } else if (status !== undefined) {
        out.push({
          kind: 'result',
          status,
          ...(result[2] !== undefined ? { ticket: result[2] } : {}),
          ...(result[3] !== undefined ? { detail: result[3].trim() } : {}),
        });
      }
    }
  }
  return out;
}

/** Best-effort `-m "subject"` extraction from a `git commit` command. */
function commitSubject(command: string): string | undefined {
  const m = /-m\s+(["'])([\s\S]*?)\1/.exec(command);
  return m?.[2];
}

function eventFromToolUse(block: ContentBlock): BacklogEvent | undefined {
  const name = block.name;
  if (name === undefined) return undefined;
  const input = block.input ?? {};

  if (name === 'Skill') {
    const skill = input.command ?? input.skill ?? input.name;
    return typeof skill === 'string' ? { kind: 'skill', name: skill } : { kind: 'skill', name: 'skill' };
  }
  if (name === 'Edit' || name === 'Write') {
    const path = input.file_path;
    return typeof path === 'string' ? { kind: 'edit', path } : { kind: 'edit' };
  }
  if (name === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : undefined;
    if (command !== undefined && /\bgit commit\b/.test(command)) {
      const subject = commitSubject(command);
      return subject !== undefined ? { kind: 'commit', subject } : { kind: 'commit' };
    }
    return command !== undefined ? { kind: 'bash', command } : { kind: 'bash' };
  }
  return { kind: 'tool', name };
}

function eventsFromAssistant(content: readonly ContentBlock[]): BacklogEvent[] {
  const out: BacklogEvent[] = [];
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      out.push(...eventsFromText(block.text));
    } else if (block.type === 'tool_use') {
      const event = eventFromToolUse(block);
      if (event !== undefined) out.push(event);
    }
  }
  return out;
}

/** Parse one stream-json line into zero or more domain events. */
export function parseLine(line: string): readonly BacklogEvent[] {
  const trimmed = line.trim();
  if (trimmed === '') return [];

  let parsed: StreamLine;
  try {
    parsed = JSON.parse(trimmed) as StreamLine;
  } catch {
    return [];
  }

  switch (parsed.type) {
    case 'system':
      if (parsed.subtype !== 'init') return [];
      return [parsed.model !== undefined ? { kind: 'init', model: parsed.model } : { kind: 'init' }];
    case 'assistant':
      return eventsFromAssistant(parsed.message?.content ?? []);
    case 'result':
      return [
        {
          kind: 'session-end',
          isError: parsed.is_error === true,
          ...(typeof parsed.total_cost_usd === 'number' ? { costUsd: parsed.total_cost_usd } : {}),
        },
      ];
    default:
      return [];
  }
}

/** Parse a whole stream (newline-delimited) into a flat event list. */
export function parseStream(text: string): readonly BacklogEvent[] {
  return text.split('\n').flatMap((line) => [...parseLine(line)]);
}
