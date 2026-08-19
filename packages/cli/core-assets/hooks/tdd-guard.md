# `tdd-guard` hook

PreToolUse hook on `Edit` / `Write`. Materializes the `tdd` skill's Iron Law mechanically: blocks edits to production paths that add behavior without a corresponding test change in the same staged change set, unless a legitimate bypass applies.

In `strict` mode: blocks (exit 1).
In `souple` mode: warns (exit 2).
In `exploratory` mode: no-op (exit 0).

See `plans/skill-audits/tdd.md` for the Iron Law and the bypass rationale. See Section 0bis.3 of `plans/2026-05-29-void-harness-design.md` for the list of legitimate bypasses.

## Configuration

Read from `.void/config.json` of the consumer project:

```json
{
  "modes": { "tdd": "auto" },
  "paths": {
    "business": "apps/*/src/**",
    "tests": "apps/*/src/**/*.test.{ts,tsx}",
    "spikes": "apps/*/scripts/spike-*"
  }
}
```

If `.void/config.json` is absent, sensible defaults are used (see hook source).

## Bypasses applied (in order)

1. Doc-only changes (`.md`, `.mdx`, `.txt`, files under `docs/`)
2. Config and build files (`package.json`, `tsconfig.json`, `vitest.config.*`, `next.config.*`, `tailwind.config.*`, `drizzle.config.*`, `biome.json`, `eslint.config.*`)
3. Test fixtures and seed data (`tests/fixtures/**`, `**/__tests__/fixtures/**`, `**/seed/**`)
4. DB migrations (`**/migrations/**`, `drizzle/meta/**`) — covered by `migrations` skill
5. Spike paths (consumer-defined; default `apps/*/scripts/spike-*`)
6. Codemods (`**/codemods/**`)
7. Type-only changes (`*.d.ts`)
8. Generated code (`**/__generated__/**` or `@generated` marker in the first 3 lines)
9. The test file itself (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`)
10. Per-file exploratory marker (`// tdd-mode: exploratory` in the first 5 lines)

## Pure-deletion bypass

If the staged diff for the file contains only deletions (no `+` non-marker lines), the hook allows. Pure deletion does not require a new failing test.

## Override

- Per-file: add `// tdd-mode: exploratory` (or `strict` / `souple`) at the top of the file.
- Per-repo: set `.void/config.json` `modes.tdd` to `strict` / `souple` / `exploratory`.
- Per-session: set env `VOIDCORP_MODE_TDD=souple` (not yet wired — open question).

## Inputs (env vars set by the runner)

- `VOIDCORP_HOOK_FILE` — absolute path of the file
- `VOIDCORP_HOOK_TOOL` — `Edit` / `Write`
- `VOIDCORP_HOOK_PHASE` — `pre` / `post` (this hook only runs on `pre`)
- `VOIDCORP_HOOK_DIFF` — optional, the staged diff content
- `VOIDCORP_CONFIG` — optional, defaults to `.void/config.json`

## Exit codes

- `0` — allow
- `1` — block (message on stderr)
- `2` — warn (allow, message on stderr)

## Test fixtures (for `test/tdd-guard/`)

The skill test suite must cover at least:

- `strict` mode + production edit without sibling test → block
- `strict` mode + production edit WITH sibling test in same staged set → allow
- `souple` mode + production edit without sibling test → warn
- `exploratory` mode + any edit → allow
- Each of the 10 bypasses → allow
- Pure deletion → allow
- Override marker `// tdd-mode: exploratory` in file → allow

## Open questions

- Per-session env override (`VOIDCORP_MODE_TDD`) — wire it up in the hook or rely on `.void/config.json` only? Lean wire (faster iteration during work).
- Glob matching for `paths.business` — current `case` statement is shell glob, fine for simple patterns but not full minimatch. Defer until a consumer needs `**` patterns more complex than `apps/*/src/**`.
- Auto-detection of the test runner (vitest vs jest) for the sibling-test naming convention. Currently assumes `.test.ts(x)`. Make configurable in Phase D.
- Performance — `git diff --cached --name-only` runs every edit. Cache for the duration of a session? Defer; measure first.
