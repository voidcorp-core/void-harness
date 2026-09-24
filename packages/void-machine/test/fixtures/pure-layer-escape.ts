// Negative fixture, never run: pure-layer-types.test.ts compiles it under tsconfig.pure.json,
// where every line must fail. Under the test typecheck, with Node types, it compiles.
export const escapes = [
  () => process.getBuiltinModule('node:fs'),
  () => fetch('https://example.invalid'),
  () => Buffer.from('x'),
  () => require('node:fs'),
  () => import.meta.url,
  () => setTimeout(() => undefined, 1),
  () => structuredClone({}),
];
