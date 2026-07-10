// Domain types for the behavioral eval harness.
//
// The harness answers one question per skill: does its PROSE actually change the
// agent's behavior in the intended direction? It runs a fixture task twice — with
// the skill's SKILL.md appended to the system prompt, and without — N times each,
// then scores the resulting sandbox state. A skill "works" when the with-skill
// score beats the without-skill score by more than run-to-run noise.

/** The observable final state of ONE sandbox run, collected after `claude -p` exits. */
export interface RunOutcome {
  /** The run process itself completed (not a crash / timeout / auth failure). */
  readonly ok: boolean;
  /** Cost of the run in USD, as reported by `claude --output-format json`. */
  readonly costUsd: number;
  /** Sandbox files after the run: repo-relative path -> text content. */
  readonly files: Readonly<Record<string, string>>;
  /** The parsed `git log -1` of the sandbox; undefined if the run made no commit. */
  readonly lastCommit: CommitInfo | undefined;
  /**
   * The agent's final conversational output (`claude -p`'s `result`). This is the
   * signal for skills whose value is a DIAGNOSIS, not a file edit — brainstorming's
   * pushback, security-audit's findings. Empty string when the run produced none.
   */
  readonly transcript: string;
  /** Populated when ok is false. */
  readonly error?: string;
}

/** A commit message split at the first blank line (Conventional-Commits shape). */
export interface CommitInfo {
  readonly subject: string;
  /** Everything after the blank line following the subject (may be ''). */
  readonly body: string;
}

/** A scorer's verdict on one outcome: an overall [0,1] plus the named sub-checks. */
export interface ScoreResult {
  readonly score: number;
  readonly signals: Readonly<Record<string, boolean>>;
}

/**
 * Turns an outcome into a score. Deterministic-first: a plain function with no I/O
 * is the backbone. It MAY be async (return a Promise) — the single seam through
 * which a `judgeScorer` reaches an injected LLM judge, used ONLY when no
 * deterministic check can observe the behavior (a conversational skill).
 */
export type Scorer = (outcome: RunOutcome) => ScoreResult | Promise<ScoreResult>;

/** A per-skill rubric: the named criteria a judge scores a transcript against. */
export interface JudgeGrid {
  readonly criteria: readonly string[];
}

/** What the single-transcript judge is asked to rule on. */
export interface JudgeInput {
  readonly transcript: string;
  readonly criteria: readonly string[];
}

/** The judge's ruling: a [0,1] score, per-criterion pass/fail, and a short reason. */
export interface JudgeVerdict {
  readonly score: number;
  readonly signals: Readonly<Record<string, boolean>>;
  readonly reason: string;
}

/**
 * Port: an LLM judge over ONE transcript against a grid. The real adapter spawns a
 * separate `claude -p`; tests inject a deterministic fake. Last resort only.
 */
export type Judge = (input: JudgeInput) => Promise<JudgeVerdict>;

/** A blind A-vs-B comparison of two transcripts on the same fixture + grid. */
export interface HeadToHeadInput {
  readonly a: string;
  readonly b: string;
  readonly criteria: readonly string[];
}

/** The blind judge names a winner (or a tie) with a reason — never told which is which. */
export interface HeadToHeadVerdict {
  readonly winner: 'A' | 'B' | 'tie';
  readonly reason: string;
}

/** Port: a blind pairwise judge. Real adapter = `claude -p`; tests inject a fake. */
export type HeadToHeadJudge = (input: HeadToHeadInput) => Promise<HeadToHeadVerdict>;

/** The head-to-head comparison result — does the distillate match/beat the source? */
export interface HeadToHeadReport {
  readonly skill: string;
  readonly title: string;
  readonly runs: number;
  /** Wins for condition A (the distillate) and B (the source), plus ties. */
  readonly aWins: number;
  readonly bWins: number;
  readonly ties: number;
  readonly verdict: 'distillate-better' | 'source-better' | 'tie';
}

/**
 * Port: execute ONE sandbox run for a condition and return its outcome. The real
 * adapter copies the fixture into a throwaway dir, invokes `claude -p` (appending
 * skillBody when defined), and collects the outcome; tests inject a fake. This is
 * the single seam that keeps the runner's aggregation logic pure and LLM-free.
 */
export type RunOnce = (opts: { readonly skillBody: string | undefined }) => Promise<RunOutcome>;

/** Aggregate of the N runs of one condition (with-skill or without-skill). */
export interface ConditionResult {
  readonly scores: readonly number[];
  readonly meanScore: number;
  /** How many of the N runs completed (outcome.ok) — reliability, not quality. */
  readonly okRuns: number;
  readonly costUsd: number;
}

/** The comparison the harness exists to produce. */
export interface EvalReport {
  readonly skill: string;
  readonly title: string;
  readonly runsPerCondition: number;
  readonly withSkill: ConditionResult;
  readonly withoutSkill: ConditionResult;
  /** meanScore(with) - meanScore(without). Positive means the prose helped. */
  readonly delta: number;
  readonly verdict: 'skill-helps' | 'no-signal' | 'skill-hurts';
  readonly totalCostUsd: number;
}

/** One evaluable skill: how to set the sandbox up, the task, and how to score it. */
export interface EvalCase {
  /** The skill under test — its SKILL.md is appended for the with-skill condition. */
  readonly skill: string;
  /** Human label for the report. */
  readonly title: string;
  /** The task prompt handed to `claude -p` (identical in both conditions). */
  readonly prompt: string;
  /** Fixture files copied into each throwaway sandbox before the run. */
  readonly fixture: Readonly<Record<string, string>>;
  /** Deterministic-first scorer over the run outcome. */
  readonly scorer: Scorer;
  /**
   * Optional rubric for a conversational skill whose value is not observable in
   * files. When set, the CLI builds a `judgeScorer(realJudge, grid)` — the last
   * resort. A case has EITHER a deterministic scorer OR a judge grid as its primary
   * signal; when both are present the judge grid wins for the report.
   */
  readonly judge?: JudgeGrid;
}
