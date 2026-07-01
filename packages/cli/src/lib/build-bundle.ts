import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
// src/lib/build-bundle.ts -> src/void-graph.ts
const ENTRY = resolve(HERE, '..', 'void-graph.ts');

// Source uses NodeNext `./x.js` specifiers that point at `.ts` files. Map them back so esbuild
// can bundle straight from source (bare specifiers like @voidcorp/harness-graph resolve normally).
const tsSourceResolve: Plugin = {
  name: 'ts-source-resolve',
  setup(builder) {
    builder.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.path.startsWith('.')) return undefined;
      const ts = resolve(dirname(args.importer), args.path.replace(/\.js$/, '.ts'));
      return existsSync(ts) ? { path: ts } : undefined;
    });
  },
};

/**
 * Bundle the graph CLI into a single self-contained ESM string: the kernel is inlined and the
 * model is baked in via the `__VOID_BUNDLED_MODEL__` define. Node builtins stay external.
 * Deterministic — the same model string in yields byte-identical output.
 */
export async function buildVoidGraphBundle(modelJson: string): Promise<string> {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    legalComments: 'none',
    define: { __VOID_BUNDLED_MODEL__: JSON.stringify(modelJson) },
    plugins: [tsSourceResolve],
    // Shebang for direct execution; a real `require` so esbuild's CJS interop (the kernel's `yaml`
    // dep ships as CommonJS) resolves instead of throwing "Dynamic require is not supported".
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire as __voidCreateRequire } from 'node:module';\nvar require = __voidCreateRequire(import.meta.url);",
    },
  });
  const file = result.outputFiles[0];
  if (file === undefined) throw new Error('void-graph bundle produced no output');
  return file.text;
}
