/**
 * @voidcorp/pack-monorepo — re-exports for Turborepo consumers.
 *
 * The main entry is intentionally thin. Submodule imports (./result, ./option,
 * ./pipe) are preferred for tree-shaking. The Claude/Codex SKILL.md modules
 * live under ./claude/ and are picked up by the void-harness CLI at init time.
 */

export type { Result } from './result.js';
export { ok, err, map, flatMap, mapErr, unwrap, unwrapOrThrow, tryCatch, tryCatchAsync, combine } from './result.js';

export type { Option } from './option.js';
export { some, none, isSome, isNone, fromNullable } from './option.js';

export { pipe } from './pipe.js';
