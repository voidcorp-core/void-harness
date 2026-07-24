import type { RuleVerdict } from '../enforcement/types.js';
import { allow, block } from './verdict.js';

const BRACED_HOME = `$${'{'}HOME}`;
const ROOT_TARGETS = new Set([
  '/', '/*', '~', '~/', '~/*',
  '$HOME', '$HOME/', '$HOME/*',
  BRACED_HOME, `${BRACED_HOME}/`, `${BRACED_HOME}/*`,
  '.', './', './*', '*',
]);

function unquote(command: string): string {
  return command.replaceAll('"', '').replaceAll("'", '');
}

function shellSegments(command: string): string[] {
  return command.split(/&&|\|\||[;\n]/).map((segment) => segment.trim()).filter(Boolean);
}

function recursiveRootOperation(segment: string, operation: 'rm' | 'chmod' | 'chown'): boolean {
  const tokens = unquote(segment).split(/\s+/);
  const index = tokens.indexOf(operation);
  if (index < 0) return false;
  const args = tokens.slice(index + 1);
  const recursive = args.some((token) =>
    token === '--recursive' || /^-[A-Za-z]*R[A-Za-z]*$/.test(token) || /^-[A-Za-z]*r[A-Za-z]*$/.test(token)
  );
  if (!recursive) return false;
  const target = args.at(-1) ?? '';
  return ROOT_TARGETS.has(target);
}

function violation(command: string): string | undefined {
  if (/:\(\)\s*\{\s*:\s*\|\s*:/.test(command)) return 'fork bomb';
  if (/(^|\s)mkfs(?:\.[a-z0-9]+)?(?:\s|$)/i.test(command)) return 'filesystem / raw-device write';
  if (/(^|\s)dd\b[^|]*\bof=\/dev\//i.test(command) || />\s*\/dev\/(?:sd|nvme|hd|disk)/i.test(command)) {
    return 'raw-device write';
  }
  if (/\b(?:drop\s+(?:database|table|schema)|truncate\s+table)\b/i.test(command)) {
    return 'destructive SQL (DROP / TRUNCATE)';
  }
  for (const segment of shellSegments(command)) {
    if (recursiveRootOperation(segment, 'rm')) return 'recursive delete of a root path';
    if (recursiveRootOperation(segment, 'chmod') || recursiveRootOperation(segment, 'chown')) {
      return 'recursive permission/ownership change on a root path';
    }
    if (
      /\bgit\s+push\b/.test(segment)
      && /(?:^|\s)(?:--force(?:\s|$)|-f(?:\s|$))/.test(segment)
      && !/--force-with-lease/.test(segment)
    ) {
      return 'git push --force (use --force-with-lease)';
    }
    if (
      /\bgit(?:\s+-\S+)*\s+(?:rebase|am|apply|cherry-pick)\b/.test(segment)
      && /(?:--exec(?:\s|=|$)|--rebase-merges|--strategy-option|--unsafe-paths)/.test(segment)
    ) {
      return 'git command-execution / unsafe-path flag';
    }
  }
  return undefined;
}

export function dangerousCommand(command: string): RuleVerdict {
  const evidence = violation(command);
  return evidence === undefined
    ? allow()
    : block(
        'DANGEROUS_COMMAND',
        'refusing a destructive command; use the reviewed one-shot override only when deliberate',
        [evidence],
      );
}
