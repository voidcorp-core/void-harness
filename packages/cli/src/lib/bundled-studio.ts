// Replaced by the bundle build via esbuild `define` (Step 7). Undeclared at runtime in the
// monorepo source, so `typeof` (which never throws on an undeclared identifier) yields 'undefined'.
declare const __VOID_BUNDLED_STUDIO__: string;

/**
 * Self-contained studio HTML (single-file vite build), baked into the bundle. Undefined in the
 * monorepo source — `graph live` then runs data-only. When bundled, `buildVoidGraphBundle` injects
 * the studio here so the live server can serve it at GET /.
 */
export const BUNDLED_STUDIO_HTML: string | undefined =
  typeof __VOID_BUNDLED_STUDIO__ === 'string' ? __VOID_BUNDLED_STUDIO__ : undefined;
