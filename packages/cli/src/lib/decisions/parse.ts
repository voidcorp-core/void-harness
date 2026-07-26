import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type {
  DecisionIssue,
  DecisionParseResult,
} from './types.js';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
const CREATED_AT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/;
const ADR_ID = /^adr:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const v3Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(ADR_ID),
  createdAt: z.string().regex(CREATED_AT),
  title: z.string().trim().min(1).max(200),
  status: z.enum(['proposed', 'accepted', 'deprecated', 'superseded']),
  deciders: z.array(z.string().trim().min(1)),
  supersedes: z.array(z.string().trim().min(1)),
});

const legacySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  code: DecisionIssue['code'],
  file: string,
  message: string,
): DecisionParseResult {
  return { ok: false, issues: [{ code, file, message }] };
}

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((entry) => {
      const path = entry.path.length === 0 ? '(root)' : entry.path.join('.');
      return `${path}: ${entry.message}`;
    })
    .join('; ');
}

export function parseDecision(text: string, file: string): DecisionParseResult {
  const match = text.match(FRONTMATTER);
  if (!match) {
    return issue(
      'invalid-frontmatter',
      file,
      'expected YAML frontmatter delimited by ---',
    );
  }

  let raw: unknown;
  try {
    raw = parseYaml(match[1] ?? '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return issue('invalid-yaml', file, message);
  }

  const body = (match[2] ?? '').trim();
  if (isRecord(raw) && raw.schemaVersion !== undefined) {
    const parsed = v3Schema.safeParse(raw);
    if (!parsed.success) {
      return issue(
        'invalid-v3-contract',
        file,
        formatZodIssues(parsed.error.issues),
      );
    }
    return {
      ok: true,
      value: {
        ...parsed.data,
        body,
        file,
        legacy: false,
      },
    };
  }

  const legacy = legacySchema.safeParse(raw);
  if (!legacy.success) {
    return issue(
      'invalid-legacy-contract',
      file,
      formatZodIssues(legacy.error.issues),
    );
  }

  return {
    ok: true,
    value: {
      schemaVersion: undefined,
      id: `legacy:${basename(file, '.md')}`,
      createdAt: legacy.data.date,
      title: legacy.data.title,
      status: 'accepted',
      deciders: [],
      supersedes: [],
      body,
      file,
      legacy: true,
    },
  };
}
