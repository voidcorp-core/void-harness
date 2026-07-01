// Entry point for the self-contained `void-graph` CLI shipped to harness consumers.
// `buildVoidGraphBundle` bundles this file with the kernel inlined and the baked model injected
// via the __VOID_BUNDLED_MODEL__ define. Consumers run `node void-graph.mjs <audit|cost|...>`.

import { graph } from './commands/graph.js';

graph(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err)); // allow-console: top-level CLI error reporter
  process.exitCode = 1;
});
