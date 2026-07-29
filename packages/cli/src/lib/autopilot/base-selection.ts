// Choose the base a cluster integrates onto, and pin it to a commit.
//
// `auto` means develop-then-main, in that order, and nothing else: a repo with
// neither is blocked rather than served a guess. The lease records a base SHA,
// not a branch name, because a branch moves — a worker that started from a base
// that has since advanced must be able to tell.
//
// Pure. The skill observes the remote; this decides.

export interface ObservedBranch {
  readonly name: string;
  /** Full commit id at the branch head, empty when the observer could not resolve it. */
  readonly headSha: string;
}

export interface BaseObservation {
  /** `auto`, or the exact name of a branch that must exist. */
  readonly requested: string;
  readonly branches: readonly ObservedBranch[];
}

export type BaseSelectionReason =
  | 'no-conventional-base'
  | 'requested-base-missing'
  | 'unresolved-head'
  | 'contradictory-observation';

export type BaseSelection =
  | { readonly kind: 'selected'; readonly branch: string; readonly sha: string }
  | { readonly kind: 'blocked'; readonly reason: BaseSelectionReason; readonly detail: string };

/** Preference order for `auto`, most specific first. */
const CONVENTIONAL_BASES = ['develop', 'main'] as const;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function blocked(reason: BaseSelectionReason, detail: string): BaseSelection {
  return { kind: 'blocked', reason, detail };
}

export function selectBase(observation: BaseObservation): BaseSelection {
  const branches = observation.branches;
  if (!Array.isArray(branches) || branches.length === 0) {
    return blocked('no-conventional-base', 'the observation lists no branch on the remote');
  }

  const names = new Set<string>();
  for (const branch of branches) {
    if (typeof branch?.name !== 'string' || branch.name.trim().length === 0) {
      return blocked('contradictory-observation', 'the observation contains a branch with no name');
    }
    if (names.has(branch.name)) {
      return blocked(
        'contradictory-observation',
        `the observation lists \`${branch.name}\` twice with different heads`,
      );
    }
    names.add(branch.name);
  }

  const requested = observation.requested;
  if (typeof requested !== 'string' || requested.trim().length === 0) {
    return blocked(
      'requested-base-missing',
      'no base was requested; use `auto`, or name the branch explicitly',
    );
  }

  let chosen: ObservedBranch | undefined;
  if (requested === 'auto') {
    // Exact names only. `development` is not `develop`, and treating it as one
    // would silently integrate onto a branch nobody nominated.
    chosen = CONVENTIONAL_BASES.map((name) => branches.find((b) => b.name === name)).find(
      (branch) => branch !== undefined,
    );
    if (chosen === undefined) {
      return blocked(
        'no-conventional-base',
        `\`base: auto\` looks for ${CONVENTIONAL_BASES.join(' then ')}, and neither exists on the remote`,
      );
    }
  } else {
    chosen = branches.find((branch) => branch.name === requested);
    if (chosen === undefined) {
      return blocked(
        'requested-base-missing',
        `the requested base \`${requested}\` does not exist on the remote`,
      );
    }
  }

  if (!COMMIT_SHA.test(chosen.headSha)) {
    return blocked(
      'unresolved-head',
      `the head of \`${chosen.name}\` did not resolve to a full commit id, so the lease cannot pin it`,
    );
  }
  return { kind: 'selected', branch: chosen.name, sha: chosen.headSha };
}
