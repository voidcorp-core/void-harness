import type { WorkflowMeta, WorkflowPhase } from './types.js';

const EMPTY: WorkflowMeta = { phases: [] };

/** Extract `meta.phases` from a workflow script's `export const meta = {literal}`. Tolerant: returns empty on any failure. */
export function extractMeta(text: string): WorkflowMeta {
  const marker = text.indexOf('export const meta');
  if (marker < 0) return EMPTY;
  const open = text.indexOf('{', marker);
  if (open < 0) return EMPTY;
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return EMPTY;
  const literal = text.slice(open, end + 1);
  try {
    // The meta object is a pure literal (Workflow contract): safe to evaluate.
    const value = new Function(`return (${literal});`)() as { phases?: unknown };
    if (!Array.isArray(value.phases)) return EMPTY;
    const phases: WorkflowPhase[] = [];
    for (const p of value.phases) {
      if (p && typeof p === 'object' && typeof (p as { title?: unknown }).title === 'string') {
        const title = (p as { title: string }).title;
        const detail = (p as { detail?: unknown }).detail;
        phases.push(typeof detail === 'string' ? { title, detail } : { title });
      }
    }
    return { phases };
  } catch {
    return EMPTY;
  }
}
