# `@voidcorp/pack-monorepo`

Turborepo monorepo conventions for the [void-harness](https://github.com/voidcorp-core/void-harness).

## What this pack provides

### Core helpers (`@voidcorp/pack-monorepo/*`)

- **`./result`** — `Result<T, E>` discriminated union + `ok`, `err`, `map`, `flatMap`, `mapErr`, `unwrap`, `unwrapOrThrow`, `tryCatch`, `tryCatchAsync`, `combine`. Composes with the `functional` skill.
- **`./option`** — `Option<T>` + helpers. Use when you want exhaustive pattern matching (the compiler refuses to forget the `none` branch).
- **`./pipe`** — type-safe `pipe(value, f1, f2, ...)` up to 10 stages.

### Shared configs

- **`tsconfig.strict.json`** — the strict TypeScript baseline mandated by the `typescript-strict` skill (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax). Extend it in your consumer `tsconfig.json`.
- **`biome.json`** _(Phase E follow-up)_ — Biome shared config with the lint rules expected by `typescript-strict` (`@typescript-eslint/switch-exhaustiveness-check` equivalent, `no-enum`, etc.).

### Claude / Codex modules (`@voidcorp/pack-monorepo/claude/*`)

- **`modules/`** — CLAUDE.md / AGENTS.md fragments that explain the harness-monorepo conventions to the agent (Turbo task graph, workspace layout, `@repo/*` package boundaries, ADR workflow, 5+5 service layout).
- **`skills/`** — pack-specific skills that EXTEND core skills with monorepo conventions (e.g., the path defaults used by `tdd-guard`).
- **`hooks/`** — pack-installed hooks (commitlint, gitleaks, etc.) that the consumer's lefthook.yml composes.

## Install

```bash
# Via the void-harness CLI
npx @voidfactory/harness init --pack pack-monorepo
```

The CLI installs the pack and wires its Claude / Codex modules into the consumer's CLAUDE.md / AGENTS.md.

## Direct consumer usage

```typescript
import { ok, err, type Result } from '@voidcorp/pack-monorepo/result';
import { pipe } from '@voidcorp/pack-monorepo/pipe';

function divide(a: number, b: number): Result<number, 'div-by-zero'> {
  return b === 0 ? err('div-by-zero') : ok(a / b);
}
```

In TS configs:

```json
{
  "extends": "@voidcorp/pack-monorepo/tsconfig.strict.json",
  "compilerOptions": {
    "outDir": "./dist"
  }
}
```

## Status

MVP. The Result / Option / pipe helpers are shipped. The shared Biome / lefthook / commitlint configs and the `@repo/core` env / logger / errors modules land in subsequent commits.

## License

MIT.
