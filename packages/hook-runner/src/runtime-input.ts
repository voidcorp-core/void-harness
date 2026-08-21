import { createHash } from 'node:crypto';
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import type { JsonValue } from '@voidcorp/mission-engine/events';

export type AgentRuntime = 'claude' | 'codex' | 'unknown';
export type HookPhase = 'activation' | 'outcome' | 'stop';

export interface RuntimeAdapterOptions {
  readonly runtime: AgentRuntime;
  readonly phase: HookPhase;
  readonly root: string;
}

export interface AdaptedRuntimeEvent {
  readonly runtimeSessionId: string;
  readonly source: string;
  readonly kind: string;
  readonly subject: string;
  readonly payload: JsonValue;
}

const MISSION_ID = /^mis_[A-Za-z0-9_-]{8,100}$/;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  let clean = '';
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0;
    if (point >= 0x20 && point !== 0x7f) clean += char;
    if (clean.length >= 256) break;
  }
  return clean.slice(0, 256);
}

function runtimeSession(raw: Record<string, unknown>): string {
  return text(
    raw['session_id']
    ?? raw['sessionId']
    ?? raw['thread_id']
    ?? raw['threadId'],
  );
}

function categoryFor(tool: string): 'skill' | 'agent' | 'workflow' | 'tool' {
  if (tool === 'Skill') return 'skill';
  if (
    tool === 'Task'
    || tool === 'Agent'
    || tool === 'collaborationspawn_agent'
    || tool === 'collaboration.spawn_agent'
  ) return 'agent';
  if (tool === 'Workflow') return 'workflow';
  return 'tool';
}

function nameFor(
  tool: string,
  category: ReturnType<typeof categoryFor>,
  input: Record<string, unknown>,
): string {
  if (category === 'skill') {
    return text(input['skill'] ?? input['name'], 'unknown');
  }
  if (category === 'agent') {
    return text(
      input['subagent_type'] ?? input['agent_type'] ?? input['agent'],
      tool === 'Agent' ? 'claude' : 'unknown',
    );
  }
  if (category === 'workflow') {
    const explicit = text(input['name']);
    if (explicit !== '') return explicit;
    const script = text(input['scriptPath']);
    return script === '' || script.endsWith('/')
      ? 'inline'
      : basename(script).replace(/(?:\.workflow)?\.js$/, '') || 'inline';
  }
  return tool || 'unknown';
}

function safePaths(
  input: Record<string, unknown>,
  root: string,
): readonly string[] {
  const absoluteRoot = resolve(root);
  const candidates = [
    input['file_path'],
    input['path'],
    input['pattern'],
  ];
  const paths: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length > 2_000) continue;
    if (!isAbsolute(candidate)) {
      if (!candidate.startsWith('..')) paths.push(candidate.slice(0, 500));
      continue;
    }
    const rel = relative(absoluteRoot, resolve(candidate));
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) {
      paths.push(rel.slice(0, 500));
    }
  }
  return paths;
}

function outcomeStatus(raw: Record<string, unknown>): string {
  const response = record(raw['tool_response']);
  if (response === undefined) return 'unknown';
  if (
    response['success'] === false
    || response['is_error'] === true
    || response['error'] !== undefined
  ) {
    return 'error';
  }
  return 'ok';
}

export function adaptRuntimeInput(
  value: unknown,
  options: RuntimeAdapterOptions,
): AdaptedRuntimeEvent | undefined {
  const raw = record(value);
  if (raw === undefined) return undefined;
  const runtimeSessionId = runtimeSession(raw);
  if (
    options.phase === 'stop'
    || text(raw['hook_event_name']) === 'Stop'
  ) {
    return {
      runtimeSessionId,
      source: `runtime:${options.runtime}`,
      kind: 'runtime.session.stopped',
      subject: `runtime:${options.runtime}`,
      payload: {},
    };
  }

  const tool = text(raw['tool_name'], 'unknown');
  const input = record(raw['tool_input']) ?? {};
  const category = categoryFor(tool);
  const name = nameFor(tool, category, input);
  const fileGlobs = safePaths(input, options.root);
  const extensions = fileGlobs
    .map((path) => extname(path).slice(1))
    .filter((extension) => extension !== '');
  return {
    runtimeSessionId,
    source: `runtime:${options.runtime}`,
    kind: options.phase === 'outcome'
      ? 'runtime.tool.completed'
      : 'runtime.tool.started',
    subject: `${category}:${name}`,
    payload: {
      category,
      tool,
      fileGlobs,
      extensions,
      ...(options.phase === 'outcome'
        ? { status: outcomeStatus(raw) }
        : {}),
    },
  };
}

export function deriveMissionId(
  explicit: string | undefined,
  runtime: AgentRuntime,
  runtimeSessionId: string,
  root: string,
): string {
  if (explicit !== undefined && explicit !== '') {
    if (!MISSION_ID.test(explicit)) {
      throw new Error('HOOK_INVALID_MISSION_ID: expected mis_<opaque-id>');
    }
    return explicit;
  }
  const opaque = createHash('sha256')
    .update(`${runtime}\0${runtimeSessionId || 'unknown'}\0${resolve(root)}`)
    .digest('hex')
    .slice(0, 32);
  return `mis_${opaque}`;
}
