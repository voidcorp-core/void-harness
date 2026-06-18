// Append-only live renderer for the backlog-loop flux.
//
// Deliberately append-only: each event adds one line, never redraws in place.
// An in-place TUI is illegible in the Claude Code transcript where the loop is
// also driven via /void-backlog-loop. `formatEvent` is pure (returns the line
// or undefined); `renderEvent` is the thin imperative writer.

import { c, glyph } from '../render.js';
import type { BacklogEvent } from './stream.js';

export type Write = (line: string) => void;

const MAX_VALUE = 60;

function clip(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_VALUE ? `${flat.slice(0, MAX_VALUE - 1)}…` : flat;
}

function row(label: string, value: string): string {
  return `  ${c.dim(glyph.dot)} ${c.dim(label.padEnd(8))} ${value}`;
}

/** The line to append for an event, or undefined when it renders nothing. */
export function formatEvent(event: BacklogEvent): string | undefined {
  switch (event.kind) {
    case 'init':
      return `${c.cyan(glyph.arrow)} session${event.model !== undefined ? ` ${c.dim(event.model)}` : ''}`;
    case 'phase':
      return row('phase', c.bold(event.phase));
    case 'skill':
      return row('skill', event.name);
    case 'edit':
      return row('edit', event.path ?? '?');
    case 'bash':
      return row('run', event.command !== undefined ? clip(event.command) : '');
    case 'commit':
      return row('commit', event.subject ?? '');
    case 'pr':
      return row('pr', c.cyan(event.ref));
    case 'tool':
      return row('tool', event.name);
    case 'decision':
      return row('decision', c.yellow(clip(event.text)));
    case 'result':
      return formatResult(event);
    case 'session-end':
    case 'unknown':
      return undefined;
  }
}

function formatResult(event: Extract<BacklogEvent, { kind: 'result' }>): string {
  switch (event.status) {
    case 'completed':
      return `  ${c.green(glyph.check)} ${event.ticket ?? 'ticket'} ${c.green('completed')}`;
    case 'blocked':
      return `  ${c.yellow(glyph.up)} ${event.ticket ?? 'ticket'} ${c.yellow('blocked')}${
        event.detail !== undefined ? c.dim(`: ${event.detail}`) : ''
      }`;
    case 'no_tickets':
      return `  ${c.dim(glyph.dot)} ${c.dim('backlog drained (no eligible ticket)')}`;
  }
}

/** Append the event's line via `write`, if it renders one. */
export function renderEvent(event: BacklogEvent, write: Write): void {
  const formatted = formatEvent(event);
  if (formatted !== undefined) write(formatted);
}
