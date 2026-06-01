/**
 * @voidcorp/pack-nextjs — re-exports for Next.js 16 consumers.
 *
 * Submodule imports preferred for tree-shaking:
 *   - `@voidcorp/pack-nextjs/async` — withWebhookSafety / withJobSafety / withCronSafety
 *   - `@voidcorp/pack-nextjs/ui`    — @repo/ui Radix/shadcn primitives (Phase E follow-up)
 */

export * from './async/index.js';
