import type { NodeTriggers } from '../model/types.js';
import type { ActivationTrigger } from './types.js';

// Minimal, pure glob matcher (no dependency). Supports:
//   *   -> any run of chars except '/'
//   **  -> any run of chars including '/'
//   **/ -> zero or more leading directories
// Enough for the declared skill triggers (**/*.test.ts, **/migrations/**, *.sql).
// Patterns come from skill frontmatter (author-controlled), not user input.
const SPECIAL = new Set([...'.+?^${}()|[]\\']);

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          re += '(?:.*/)?'; // **/ matches zero or more directories
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c !== undefined && SPECIAL.has(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

export function globMatches(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

/** True if a situation satisfies ANY declared trigger dimension (tool / extension / glob). */
export function triggerMatches(triggers: NodeTriggers, situation: ActivationTrigger): boolean {
  if (triggers.tools?.includes(situation.tool)) return true;
  if (triggers.extensions?.some((e) => situation.ext.includes(e))) return true;
  if (triggers.globs?.some((g) => situation.fileGlobs.some((p) => globMatches(g, p)))) return true;
  return false;
}
