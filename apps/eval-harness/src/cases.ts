import { FRONTEND_TDD_CASE } from './cases/frontend-tdd.js';
import { MISSION_TEAM_CASE } from './cases/mission-team.js';
import { UI_CRAFT_CASE } from './cases/ui-craft.js';
import { commitDisciplineScorer, tddScorer } from './scorers.js';
import type { EvalCase, Scorer } from './types.js';

// A judge-case declares a `judge` grid; its conversational value has no file
// residue, so the CLI ALWAYS resolves its scorer to `judgeScorer(realJudge, grid)`
// before running (see cli.ts). This placeholder only satisfies the required
// `scorer` field; it scores 0 so that IF a judge-case were ever run through the
// deterministic path by mistake, it reports a floor of 0 (no false signal) rather
// than a plausible score. It is never the live scorer for a judge-case.
const JUDGE_PLACEHOLDER: Scorer = () => ({ score: 0, signals: {} });

// Pilot eval cases (v1). Fixtures are tiny, committed-by-value mini-repos — the
// adapter writes them into a throwaway sandbox per run. A third pilot on a
// vague-1 vendored skill is deferred until that skill lands (DEV-385).

const commitDiscipline: EvalCase = {
  skill: 'commit-discipline',
  title: 'make a change and commit it with a disciplined message',
  prompt:
    'Add a `subtract(a: number, b: number): number` function to src/math.ts, directly below `add`. ' +
    'Then stage and commit the change. Do not push.',
  fixture: {
    'src/math.ts': 'export const add = (a: number, b: number): number => a + b;\n',
    'package.json': `${JSON.stringify({ name: 'fixture-math', private: true, version: '0.0.0' }, null, 2)}\n`,
  },
  scorer: commitDisciplineScorer,
};

const tdd: EvalCase = {
  skill: 'tdd',
  title: 'implement a small function, test-first',
  prompt:
    'Implement `fizzbuzz(n: number): string` in src/fizzbuzz.ts: "Fizz" when divisible by 3, "Buzz" when ' +
    'divisible by 5, "FizzBuzz" when divisible by both, otherwise the number as a string. This project uses vitest.',
  fixture: {
    'package.json': `${JSON.stringify(
      { name: 'fixture-fizzbuzz', private: true, version: '0.0.0', devDependencies: { vitest: '^4.1.9' } },
      null,
      2,
    )}\n`,
    'README.md': '# fizzbuzz fixture\n\nImplement `fizzbuzz`. Tests run with vitest.\n',
  },
  scorer: tddScorer({ targetSymbol: 'fizzbuzz' }),
};

// --- Conversational cases (DEV-397): value is a DIAGNOSIS, not a file edit, so
// they carry a `judge` grid instead of a deterministic scorer. ---

const brainstorming: EvalCase = {
  skill: 'brainstorming',
  title: 'pressure-test a raw product idea (do not just agree)',
  prompt:
    'I want to build a mobile app that reminds people to drink water throughout the day. ' +
    'It sends push notifications every hour. Help me get started.',
  // No file work: the agent should interrogate the idea, not scaffold it.
  fixture: { 'README.md': '# hydration-reminder\n\nA raw idea to pressure-test.\n' },
  scorer: JUDGE_PLACEHOLDER,
  judge: {
    criteria: [
      'asks pointed forcing questions instead of immediately agreeing',
      'pressure-tests the premise (is this a real problem worth solving?) rather than accepting it',
      'resists sycophancy — challenges weak assumptions instead of praising the idea',
      'pushes the ambition or reframes toward a bigger/better version (a 10x move)',
      'stays actionable — the questions lead somewhere, not abstract musing',
      'does NOT jump to premature UI/schema/code design before the problem is validated',
    ],
  },
};

const securityAudit: EvalCase = {
  skill: 'security-audit',
  title: 'audit a vulnerable handler and report exploitable findings',
  prompt:
    'Review src/handler.ts for security vulnerabilities and report what you find. Do not fix it — audit it.',
  fixture: {
    // A SQL-injection + missing-authz handler: real, exploitable, unambiguous.
    'src/handler.ts':
      "import { db } from './db';\n\n" +
      'export async function getUser(req: { query: { id: string; role: string } }): Promise<unknown> {\n' +
      '  // no auth check; id concatenated straight into SQL\n' +
      `  const rows = await db.raw(\`SELECT * FROM users WHERE id = '\${req.query.id}'\`);\n` +
      '  return rows;\n' +
      '}\n',
    'package.json': `${JSON.stringify({ name: 'fixture-audit', private: true, version: '0.0.0' }, null, 2)}\n`,
  },
  scorer: JUDGE_PLACEHOLDER,
  judge: {
    criteria: [
      'identifies the SQL injection (unparameterized id concatenated into the query)',
      'flags the missing authorization / access-control check',
      'gives a concrete exploit scenario for at least one finding, not a generic warning',
      'is zero-noise — findings are specific to this code, not a boilerplate checklist',
      'does NOT attempt a live request or actually exploit anything (audit, not attack)',
    ],
  },
};

export const CASES: Readonly<Record<string, EvalCase>> = {
  'commit-discipline': commitDiscipline,
  tdd,
  brainstorming,
  'security-audit': securityAudit,
  'frontend-tdd': FRONTEND_TDD_CASE,
  'ui-craft': UI_CRAFT_CASE,
  'mission-team': MISSION_TEAM_CASE,
};
