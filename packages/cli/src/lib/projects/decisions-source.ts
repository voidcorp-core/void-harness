// What a project's decisions look like, whichever format they are written in.
//
// Measured 2026-08-17 across the real park: 426 decisions exist, and 294 of
// them sit in a monolithic `docs/DECISIONS.md` — the format this repo itself
// abandoned. A reader that only understands `docs/decisions-log/` reports zero
// where the knowledge actually is, which is exactly the question the command
// center exists to answer.
//
// Pure. Callers read the files; this interprets their content.
//
// Detection keys on the FROZEN MARKER, never on a count. void-harness carries
// 96 monolith entries against 132 per-file records: counting says nothing,
// while a header declaring the snapshot frozen and pointing at the directory
// settles it. A frozen monolith is conformant; a live one is drift.

/** A decision, reduced to what a card or a resume line needs. */
export interface DecisionEntry {
  readonly title: string;
  /** Absent when the source carries no date — a numbered monolith never does. */
  readonly date?: string;
}

export type DecisionsFormat = 'per-file' | 'frozen-monolith' | 'live-monolith' | 'none';

export interface DecisionsObservation {
  readonly format: DecisionsFormat;
  readonly count: number;
  /** Newest first, bounded. Never the whole file. */
  readonly recent: readonly DecisionEntry[];
  /**
   * Entries still being written into a monolith while per-file records exist.
   * Non-zero means drift the conformance rule must see, so `format: 'per-file'`
   * must not mask it.
   */
  readonly liveMonolithEntries: number;
}

export interface DecisionsInput {
  /** Raw `docs/DECISIONS.md`, or undefined when absent. */
  readonly monolith: string | undefined;
  /** Already-parsed per-file records from `docs/decisions-log/`. */
  readonly perFile: readonly DecisionEntry[];
}

/** `### 01. Title` — the numbered monolith used across consumer projects. */
const NUMBERED_ENTRY = /^#{2,3} \d+\.[ \t]+(.+)$/;
/** `## 2026-07-22: Title` — the dated monolith this repo froze. */
const DATED_ENTRY = /^#{2,3} (\d{4}-\d{2}-\d{2})[:.][ \t]+(.+)$/;
/**
 * `## ADR-001 - Title (2026-06-01)` — a prefixed id with the date trailing.
 * Found only by running the parser against the real park; the third format is
 * why this module reads content rather than trusting one convention.
 */
const PREFIXED_ENTRY = /^#{2,3} [A-Z]+-\d+[ \t]*[-–—][ \t]*(.+?)[ \t]*\((\d{4}-\d{2}-\d{2})\)[ \t]*$/;
/** How a monolith declares it is no longer the source. Written by the repair. */
const FROZEN_MARKER = /frozen legacy (?:snapshot|landing page)/i;

const RECENT_LIMIT = 5;
const MAX_TITLE = 200;
/** A monolith is prose; past this we are reading something else entirely. */
const MAX_INPUT = 2_000_000;

const EMPTY: DecisionsObservation = Object.freeze({
  format: 'none',
  count: 0,
  recent: [],
  liveMonolithEntries: 0,
});

/**
 * Trim a title to something a card can hold. Control characters are stripped
 * rather than rejected: a decision title is display text, and refusing to show
 * a project because one heading carries a stray byte would lose the view for
 * the one reason that does not matter.
 */
function cleanTitle(raw: string): string {
  const flat = [...raw]
    .filter((ch) => {
      const point = ch.codePointAt(0) ?? 0;
      return point >= 0x20 && point !== 0x7f;
    })
    .join('')
    .trim();
  return flat.length <= MAX_TITLE ? flat : `${flat.slice(0, MAX_TITLE - 1)}…`;
}

function parseMonolith(content: string): readonly DecisionEntry[] {
  const entries: DecisionEntry[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const prefixed = PREFIXED_ENTRY.exec(rawLine) ?? undefined;
    if (prefixed !== undefined) {
      const title = cleanTitle(prefixed[1] ?? '');
      if (title !== '') entries.push({ title, date: prefixed[2] as string });
      continue;
    }
    const dated = DATED_ENTRY.exec(rawLine) ?? undefined;
    if (dated !== undefined) {
      const title = cleanTitle(dated[2] ?? '');
      if (title !== '') entries.push({ title, date: dated[1] as string });
      continue;
    }
    const numbered = NUMBERED_ENTRY.exec(rawLine) ?? undefined;
    if (numbered !== undefined) {
      const title = cleanTitle(numbered[1] ?? '');
      if (title !== '') entries.push({ title });
    }
  }
  return entries;
}

/**
 * Newest first. Dated entries sort by date; undated ones keep reverse document
 * order, which for a numbered monolith is the closest honest proxy for recency
 * — the highest number was written last.
 */
function newestFirst(entries: readonly DecisionEntry[]): readonly DecisionEntry[] {
  const dated = entries.filter((entry) => entry.date !== undefined);
  const undated = entries.filter((entry) => entry.date === undefined);
  const sortedDated = [...dated].sort((a, b) => ((a.date as string) < (b.date as string) ? 1 : -1));
  return [...sortedDated, ...[...undated].reverse()];
}

/** Interpret a project's decision sources. Never throws. */
export function observeDecisions(input: DecisionsInput): DecisionsObservation {
  const raw = input.monolith ?? '';
  const monolith = raw.length > MAX_INPUT ? raw.slice(0, MAX_INPUT) : raw;
  const monolithEntries = monolith === '' ? [] : parseMonolith(monolith);
  const frozen = FROZEN_MARKER.test(monolith);
  const liveMonolithEntries = frozen ? 0 : monolithEntries.length;

  if (input.perFile.length > 0) {
    return {
      format: 'per-file',
      count: input.perFile.length,
      recent: newestFirst(input.perFile).slice(0, RECENT_LIMIT),
      liveMonolithEntries,
    };
  }

  if (monolithEntries.length === 0) return EMPTY;

  return {
    format: frozen ? 'frozen-monolith' : 'live-monolith',
    count: monolithEntries.length,
    recent: newestFirst(monolithEntries).slice(0, RECENT_LIMIT),
    liveMonolithEntries,
  };
}
