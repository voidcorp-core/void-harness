// tdd-cover: e2e packages/void-machine/test/file-journal-contract.test.ts

/**
 * Append-only mission journal. One revision is granted to exactly one writer;
 * a reader never repairs, truncates or rewrites what it cannot interpret.
 */
export type JournalRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'records'; readonly records: readonly unknown[] }
  | { readonly kind: 'unreadable'; readonly reason: string };

export type JournalAppend =
  | { readonly kind: 'appended'; readonly revision: number }
  | { readonly kind: 'conflict' }
  /** Linked and visible to readers, but its durability could not be confirmed. */
  | { readonly kind: 'unconfirmed'; readonly revision: number; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

export interface MissionJournal {
  readonly read: (missionId: string) => Promise<JournalRead>;
  /** Writes revision expectedRevision + 1, or reports that another writer holds it. */
  readonly append: (missionId: string, expectedRevision: number, record: unknown) => Promise<JournalAppend>;
}
