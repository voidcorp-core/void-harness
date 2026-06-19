// `void-harness feedback push` (issue #17 cluster C): promote the HITL inbound
// queue (.void/harness-feedback/proposed/*.md) to GitHub issues on the harness
// repo. The note frontmatter is inconsistent across the codebase (trigger /
// observation / target vs source / kind / severity), so the parse is tolerant
// and the body is filed verbatim. Pure builders here; the command does the I/O.

/** A parsed inbound feedback note. */
export interface ProposedNote {
  /** Basename of the source file. */
  readonly file: string;
  /** A short, human-readable title derived from the note. */
  readonly title: string;
  /** skill | hook | rule | dx, if the frontmatter declared it. */
  readonly kind: string | undefined;
  readonly severity: string | undefined;
  /** The full note content, filed verbatim as the issue body. */
  readonly body: string;
}

const TITLE_MAX = 72;

/** Extract `key: value` pairs from a leading `--- ... ---` frontmatter block. */
function frontmatter(content: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (match?.[1] === undefined) return {};
  const fields: Record<string, string> = {};
  for (const raw of match[1].split('\n')) {
    const colon = raw.indexOf(':');
    if (colon < 0) continue;
    const key = raw.slice(0, colon).trim();
    const value = raw.slice(colon + 1).trim();
    if (key !== '' && value !== '') fields[key] = value;
  }
  return fields;
}

/** First markdown `# heading` text in the body, if any. */
function firstHeading(content: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(content);
  return match?.[1]?.trim();
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Parse a proposed note, tolerating the varied frontmatter shapes in the repo. */
export function parseProposedNote(file: string, content: string): ProposedNote {
  const fm = frontmatter(content);
  const descriptor = fm.trigger ?? fm.source ?? firstHeading(content) ?? file.replace(/\.md$/, '');
  return {
    file,
    title: clip(descriptor, TITLE_MAX),
    kind: fm.kind ?? fm.target,
    severity: fm.severity ?? fm.confidence,
    body: content,
  };
}

/**
 * Build `gh issue create` args for a note on the given repo. The body is the
 * verbatim note; labels are `harness-feedback` plus the note's kind when known.
 */
export function issueCreateArgs(repo: string, note: ProposedNote): string[] {
  const args = [
    'issue',
    'create',
    '--repo',
    repo,
    '--title',
    clip(`[harness-feedback] ${note.title}`, TITLE_MAX),
    '--body',
    note.body,
    '--label',
    'harness-feedback',
  ];
  if (note.kind !== undefined) args.push('--label', note.kind);
  return args;
}
