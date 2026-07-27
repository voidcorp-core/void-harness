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

export const frontendTddScorer =
  (cfg: { readonly targetSymbol: string }) =>
  (outcome: RunOutcome): ScoreResult => {
    const tests = Object.entries(outcome.files).filter(([path]) =>
      /\.(test|spec)\.[cm]?tsx?$/.test(path)
    );
    const bodies = tests.map(([, content]) => content);
    const signals = {
      testExists: tests.length > 0,
      targetsComponent: bodies.some((body) => body.includes(cfg.targetSymbol)),
      keyboardRegression: bodies.some((body) =>
        /(?:userEvent\.keyboard|fireEvent\.keyDown)/.test(body)
        && /(?:Enter|Escape|ArrowDown|ArrowUp)/.test(body)
      ),
      accessibleQuery: bodies.some((body) => /(?:get|find|query)By(?:Role|LabelText)/.test(body)),
    };
    return { score: mean(Object.values(signals)), signals };
  };

const UI_DIMENSIONS = [
  'hierarchy',
  'information-architecture',
  'interaction-states',
  'responsive-intent',
  'distinctiveness',
  'accessibility',
] as const;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function uiEvidence(body: string | undefined): Record<string, unknown> | undefined {
  if (body === undefined || body.length > 64 * 1024) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function currentUiProof(evidence: Record<string, unknown> | undefined): boolean {
  if (evidence === undefined || typeof evidence['diffHash'] !== 'string') return false;
  const diffHash = evidence['diffHash'];
  if (!SHA256.test(diffHash) || !Array.isArray(evidence['screenshots'])) return false;
  if (!Array.isArray(evidence['tests'])) return false;
  const screenshots = evidence['screenshots'].filter((item): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
  );
  const required = ['default:mobile', 'default:desktop', 'error:mobile', 'error:desktop'];
  const covered = new Set(screenshots
    .filter((shot) => shot['diffHash'] === diffHash)
    .map((shot) => `${String(shot['state'])}:${String(shot['viewport'])}`));
  const tests = evidence['tests'].filter((item): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
  );
  return required.every((key) => covered.has(key))
    && tests.some((test) => test['status'] === 'passed' && test['diffHash'] === diffHash);
}

function craftFloor(evidence: Record<string, unknown> | undefined): boolean {
  const scores = evidence?.['scores'];
  if (typeof scores !== 'object' || scores === null || Array.isArray(scores)) return false;
  const record = scores as Record<string, unknown>;
  return UI_DIMENSIONS.every((dimension) =>
    typeof record[dimension] === 'number'
    && Number.isFinite(record[dimension])
    && Number(record[dimension]) >= 8
    && Number(record[dimension]) <= 10
  );
}

export const uiCraftScorer = (outcome: RunOutcome): ScoreResult => {
  const surface = Object.entries(outcome.files)
    .filter(([path]) => /\.(?:html|css|tsx|jsx)$/.test(path))
    .map(([, content]) => content)
    .join('\n');
  const evidence = uiEvidence(outcome.files['artifacts/ui-quality.json']);
  const signals = {
    avoidsGenericSlop: !/(?:linear-gradient|backdrop-filter|glass-card|build faster|ship smarter)/i.test(surface),
    responsiveIntent: /@media\s*\(/.test(surface),
    focusVisible: /:focus-visible/.test(surface),
    stateCoverage: /data-state=["'][^"']+["']/.test(surface),
    deterministicEvidence: currentUiProof(evidence),
    craftFloor: craftFloor(evidence),
  };
  return { score: mean(Object.values(signals)), signals };
};
