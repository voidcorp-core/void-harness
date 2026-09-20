# Void Machine (private workspace)

Retained Machine capabilities, distributed only through the existing voidharness
CLI at A5. No separate publication, controller, provider or coordinator API.

A1 candidate entry after build: `node dist/application/cli.js doctor --json`.
The public npm launcher remains on Rust until A5. Direct application callers
supply cwd and environment. Doctor is read-only; paths follow XDG_CACHE_HOME,
then HOME/.cache, then repository .void/machine/cache. USERPROFILE is not a new
fallback. machine.toml path fields remain validated but do not override discovery,
matching retained behavior. No generic core is needed for this command.

Configuration/lock reads are capped at 65,536 bytes, strictly decoded as UTF-8,
and restricted to regular files. Malformed syntax/version/types are degraded;
read failures are blocked. Parser diagnostics never expose source contents.
TOML has maximum nesting 16 and exact integer parsing. Empty config remains valid;
its known fields are optional. A lock requires numeric schemaVersion 1; legacy
extra metadata remains readable. Reports preserve present nullable v1 fields;
compare parsed values, not JSON whitespace/control-character escaping.

Source grounding:

- smol-toml 1.8.0 [README](https://github.com/squirrelchat/smol-toml/blob/v1.8.0/README.md)
  and [parse options](https://github.com/squirrelchat/smol-toml/blob/v1.8.0/src/parse.ts):
  parse, maxDepth, integersAsBigInt; UTF-8 validation belongs to our file adapter.
- Zod 4.4.3 installed README and src/v4/classic/schemas.ts: strictObject,
  looseObject and safeParse; [object API](https://zod.dev/api#objects).
- TypeScript 5.9.3 installed package; [NodeNext module configuration](https://www.typescriptlang.org/tsconfig/module.html).
  Reuse the repository strict baseline and emit Node ESM. No runtime TS loader.
- Node 22 [filesystem API](https://nodejs.org/docs/latest-v22.x/api/fs.html):
  openSync, fstatSync, readSync and closeSync bound the actual file read.

The existing packed CLI budget is 2,000,000 bytes. Measure check:size before A5;
do not drop maintained parsing or raise the ceiling to make the gate green.


## M1 private application boundary

`src/application/note.ts` composes two injected asynchronous executors. Model and
runtime configuration stays in those caller-supplied functions; no provider,
process protocol or doctor dependency is required. `runtime/execution.ts` owns
correlation, caller-armed deadlines and explicit stop observations. Its injected
clock only schedules a callback and returns a cancellation function.

`sourced-note` owns question/two-source validation, exact quotation membership,
coverage of both sources and bounded JSON deliverables. Completed means this
structural/sourcing contract passed, not semantic quality certification.
Timeout requests AbortSignal and returns requested-unconfirmed cancellation;
it never asserts remote termination, retries or durable recovery.

The first proof uses simulated executors and a manual clock through the real
application/runtime. It does not prove real model execution. No process fixture
or general orchestration framework is needed for this transport-neutral seam.
