import type { RuleVerdict } from '../enforcement/types.js';

export function allow(code = 'ALLOW', message = 'allowed'): RuleVerdict {
  return { allow: true, code, message, evidence: [] };
}

export function block(
  code: string,
  message: string,
  evidence: readonly string[],
): RuleVerdict {
  return { allow: false, code, message, evidence };
}
