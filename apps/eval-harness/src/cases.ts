import { commitDisciplineScorer, tddScorer } from './scorers.js';
import type { EvalCase } from './types.js';

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

export const CASES: Readonly<Record<string, EvalCase>> = { 'commit-discipline': commitDiscipline, tdd };
