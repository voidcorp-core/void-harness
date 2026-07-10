import type { RunOutcome, ScoreResult } from './types.js';

// Conventional Commits subject: a known type, optional (scope), optional !, then a
// non-trivial subject. Kept in lockstep with the commit-discipline skill's allowed types.
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._-]+\))?!?: .{3,}/;

// ASCII-clean per the skill: no em/en dash, no emoji (Extended_Pictographic).
const isAsciiClean = (text: string): boolean => !/[—–]/.test(text) && !/\p{Extended_Pictographic}/u.test(text);

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

const mean = (bools: readonly boolean[]): number =>
  bools.length === 0 ? 0 : bools.filter(Boolean).length / bools.length;

// These two are DETERMINISTIC scorers: they return synchronously and are the
// backbone (DEV-394). They are intentionally NOT annotated `: Scorer` — that port
// widened to `ScoreResult | Promise<ScoreResult>` for the async judge path (DEV-397),
// and annotating them would erase their sync return type at call sites. They remain
// structurally assignable to the `Scorer` port where a case wires them.

/**
 * 100% deterministic — no LLM judge. Scores the run's last commit against the
 * commit-discipline floor: Conventional subject, a why-body, ASCII-clean text.
 * No commit at all scores 0 (the task was to commit well; nothing is a fail).
 */
export const commitDisciplineScorer = (outcome: RunOutcome): ScoreResult => {
  const commit = outcome.lastCommit;
  const conventionalSubject = commit !== undefined && CONVENTIONAL.test(commit.subject);
  const explainsWhy = commit !== undefined && wordCount(commit.body) >= 3;
  const asciiClean = commit !== undefined && isAsciiClean(`${commit.subject}\n${commit.body}`);
  const signals = { conventionalSubject, explainsWhy, asciiClean };
  return { score: mean(Object.values(signals)), signals };
};

/**
 * Deterministic structural signals for TDD adherence: a test file was written,
 * and it references the symbol under implementation. It cannot prove test-BEFORE-
 * code from a finished sandbox, so it measures the observable residue — a covering
 * test exists — which the without-skill baseline frequently skips.
 */
export const tddScorer =
  (cfg: { readonly targetSymbol: string }) =>
  (outcome: RunOutcome): ScoreResult => {
    const tests = Object.entries(outcome.files).filter(([path]) => /\.(test|spec)\.[cm]?tsx?$/.test(path));
    const testExists = tests.length > 0;
    const testTargetsCode = tests.some(([, content]) => content.includes(cfg.targetSymbol));
    const signals = { testExists, testTargetsCode };
    return { score: mean(Object.values(signals)), signals };
  };
