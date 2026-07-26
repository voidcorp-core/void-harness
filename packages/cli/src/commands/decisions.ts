import { relative } from 'node:path';
import { createDecision } from '../lib/decisions/create.js';
import { checkDecisionImmutability } from '../lib/decisions/immutability.js';
import { loadDecisions } from '../lib/decisions/load.js';
import {
  renderDecisionsJson,
  renderDecisionsMarkdown,
} from '../lib/decisions/render.js';
import type {
  DecisionIssue,
  DecisionStatus,
} from '../lib/decisions/types.js';
import {
  DECISION_STATUSES,
} from '../lib/decisions/types.js';
import { validateDecisions } from '../lib/decisions/validate.js';

interface InvalidArgs {
  readonly kind: 'invalid';
  readonly code: 'DECISIONS_USAGE';
  readonly problem: string;
  readonly cause: string;
  readonly fix: string;
}

type DecisionsArgs =
  | {
      readonly kind: 'new';
      readonly title: string;
      readonly slug: string;
      readonly status: DecisionStatus;
      readonly deciders: readonly string[];
      readonly supersedes: readonly string[];
      readonly json: boolean;
    }
  | { readonly kind: 'check'; readonly base?: string; readonly json: boolean }
  | { readonly kind: 'render'; readonly format: 'markdown' | 'json' }
  | { readonly kind: 'help' }
  | InvalidArgs;

function invalid(problem: string, cause: string, fix: string): InvalidArgs {
  return { kind: 'invalid', code: 'DECISIONS_USAGE', problem, cause, fix };
}

function isDecisionStatus(value: string): value is DecisionStatus {
  return DECISION_STATUSES.some((status) => status === value);
}

function valuesAfter(args: readonly string[], option: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === option && args[index + 1] !== undefined) {
      values.push(args[index + 1] ?? '');
      index += 1;
    }
  }
  return values;
}

function valueAfter(args: readonly string[], option: string): string | undefined {
  return valuesAfter(args, option)[0];
}

function validateOptions(
  args: readonly string[],
  subcommand: string,
  valueOptions: readonly string[],
  booleanOptions: readonly string[],
): InvalidArgs | undefined {
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index] ?? '';
    if (valueOptions.includes(token)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return invalid(
          `missing value for ${token}`,
          `${token} requires a value`,
          `void-harness decisions ${subcommand} --help`,
        );
      }
      index += 1;
      continue;
    }
    if (booleanOptions.includes(token)) continue;
    return invalid(
      `unknown option '${token}'`,
      `decisions ${subcommand} does not support this option`,
      `void-harness decisions ${subcommand} --help`,
    );
  }
  return undefined;
}

export function parseDecisionsArgs(args: readonly string[]): DecisionsArgs {
  const [subcommand] = args;
  if (subcommand === undefined || subcommand === 'help' || subcommand === '--help') {
    return { kind: 'help' };
  }
  if (args.slice(1).includes('--help')) return { kind: 'help' };
  if (subcommand === 'new') {
    const optionsError = validateOptions(
      args,
      subcommand,
      ['--title', '--slug', '--status', '--decider', '--supersedes'],
      ['--json'],
    );
    if (optionsError !== undefined) return optionsError;
    const title = valueAfter(args, '--title');
    const slug = valueAfter(args, '--slug');
    const rawStatus = valueAfter(args, '--status') ?? 'proposed';
    if (title === undefined) {
      return invalid(
        'missing required option --title',
        'decisions new needs a human-readable decision title',
        'void-harness decisions new --title <title> --slug <slug>',
      );
    }
    const cleanTitle = title.trim();
    if (cleanTitle === '' || cleanTitle.length > 200) {
      return invalid(
        cleanTitle === '' ? 'invalid empty title' : 'title exceeds 200 characters',
        '--title must contain readable text',
        'provide a decision title of 1 to 200 characters',
      );
    }
    if (slug === undefined) {
      return invalid(
        'missing required option --slug',
        'decisions new requires a stable readable filename slug',
        'void-harness decisions new --title <title> --slug <slug>',
      );
    }
    if (!isDecisionStatus(rawStatus)) {
      return invalid(
        `invalid status '${rawStatus}'`,
        `status must be one of: ${DECISION_STATUSES.join(', ')}`,
        'use --status proposed for a new draft',
      );
    }
    return {
      kind: 'new',
      title: cleanTitle,
      slug,
      status: rawStatus,
      deciders: valuesAfter(args, '--decider'),
      supersedes: valuesAfter(args, '--supersedes'),
      json: args.includes('--json'),
    };
  }
  if (subcommand === 'check') {
    const optionsError = validateOptions(
      args,
      subcommand,
      ['--base'],
      ['--json'],
    );
    if (optionsError !== undefined) return optionsError;
    const base = valueAfter(args, '--base');
    return {
      kind: 'check',
      ...(base === undefined ? {} : { base }),
      json: args.includes('--json'),
    };
  }
  if (subcommand === 'render') {
    const optionsError = validateOptions(
      args,
      subcommand,
      ['--format'],
      [],
    );
    if (optionsError !== undefined) return optionsError;
    const format = valueAfter(args, '--format') ?? 'markdown';
    if (format !== 'markdown' && format !== 'json') {
      return invalid(
        `invalid render format '${format}'`,
        'render supports only markdown or json',
        'void-harness decisions render --format markdown',
      );
    }
    return { kind: 'render', format };
  }
  return invalid(
    `unknown decisions subcommand '${subcommand}'`,
    'supported subcommands are new, check, and render',
    'void-harness decisions --help',
  );
}

function write(value: string): void {
  process.stdout.write(value);
}

function writeError(value: string): void {
  process.stderr.write(value);
}

function renderUsage(): string {
  return `void-harness decisions

  decisions new --title <title> --slug <slug> [--status proposed] [--decider <id>] [--supersedes <id>] [--json]
  decisions check [--base <git-ref>] [--json]
  decisions render [--format markdown|json]
`;
}

function renderIssues(issues: readonly DecisionIssue[]): string {
  return issues
    .map((issue) => `${issue.code} ${issue.file}: ${issue.message}`)
    .join('\n');
}

export async function decisions(args: readonly string[]): Promise<void> {
  const parsed = parseDecisionsArgs(args);
  if (parsed.kind === 'help') {
    write(renderUsage());
    return;
  }
  if (parsed.kind === 'invalid') {
    writeError(
      `${parsed.code}: ${parsed.problem}\nCause: ${parsed.cause}\nFix: ${parsed.fix}\n`,
    );
    process.exitCode = 2;
    return;
  }

  const root = process.cwd();
  if (parsed.kind === 'new') {
    const created = await createDecision(root, {
      title: parsed.title,
      slug: parsed.slug,
      status: parsed.status,
      deciders: parsed.deciders,
      supersedes: parsed.supersedes,
    });
    const path = relative(root, created.path);
    if (parsed.json) {
      write(`${JSON.stringify({ id: created.id, path })}\n`);
    } else {
      write(`${path}\n${created.id}\n`);
    }
    return;
  }

  const loaded = await loadDecisions(root);
  const structural = [...loaded.issues, ...validateDecisions(loaded.records)];
  if (parsed.kind === 'check') {
    const base = parsed.base ?? process.env.DECISIONS_BASE;
    const immutable = base
      ? await checkDecisionImmutability(root, loaded.directory, base)
      : [];
    const issues = [...structural, ...immutable];
    if (parsed.json) {
      write(`${JSON.stringify({
        ok: issues.length === 0,
        count: loaded.records.length,
        immutabilityChecked: base !== undefined && base !== '',
        issues,
      })}\n`);
    } else if (issues.length === 0) {
      write(
        `decisions:check - ${loaded.records.length} decision(s) valid`
        + `${base ? `, immutable since ${base}` : ', immutability not checked (no base)'}\n`,
      );
    } else {
      writeError(`${renderIssues(issues)}\n`);
    }
    if (issues.length > 0) process.exitCode = 1;
    return;
  }

  if (structural.length > 0) {
    writeError(`${renderIssues(structural)}\n`);
    process.exitCode = 1;
    return;
  }
  write(
    parsed.format === 'json'
      ? renderDecisionsJson(loaded.records)
      : renderDecisionsMarkdown(loaded.records),
  );
}
