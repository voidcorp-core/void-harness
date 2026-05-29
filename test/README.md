# Skill tests

Tests for void-harness skills and hooks. Each skill / hook has its own directory under this root.

## Pattern

```
test/
├── <skill-or-hook-name>/
│   ├── <name>.test.ts          # Vitest test cases
│   └── fixtures/               # Input fixtures (mock files, sample diffs, etc.)
```

## Running

From the repo root:

```bash
pnpm vitest run                                  # all tests
pnpm vitest run test/tdd-guard/                  # one skill / hook
pnpm vitest --watch test/tdd-guard/              # iterate
```

## What to test

For a SKILL.md:

- Does the frontmatter `description` match the matrix anchor?
- Do the hard rules listed in SKILL.md match the audit note in `plans/skill-audits/<skill>.md`?
- Does the SKILL.md size respect the anti-bloat cap (≤ 400 LOC)?

For a hook (shell script):

- Each documented bypass / mode / whitelist case → its own test fixture + assertion on exit code + stderr content.
- Edge cases: missing env vars, missing config, empty staged set, large staged set.

## CI gate

The CI workflow runs `pnpm vitest run` on every PR. A broken skill or hook test blocks the release.

## Status

Phase E in progress. `test/tdd-guard/` shipped as the reference. Remaining 19 hooks + 21 SKILL.md tests land in Phase E follow-up commits.
