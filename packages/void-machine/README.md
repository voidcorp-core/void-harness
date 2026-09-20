# Void Machine (private workspace)

Private Machine foundation. Any future distribution uses the existing voidharness
CLI; the former A5 cutover is deferred under the clean-sheet mandate. No separate
publication, controller, provider or coordinator API.

A1 candidate entry after build: `node dist/application/cli.js doctor --json`.
The public npm launcher remains on Rust; no cutover is delivered here. Direct application callers
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
  Reuse the repository strict baseline and emit Node ESM. Distribution needs no
  runtime TS loader. Doctor contract tests run current sources with the existing
  CLI test dependency tsx 4.22.4 through Node --import, as the repository stdin
  process test does. Installed tsx package.json exports and dist/loader.mjs are
  the version-specific references; no dependency or configuration was added.
- Node 22 [filesystem API](https://nodejs.org/docs/latest-v22.x/api/fs.html):
  openSync, fstatSync, readSync and closeSync bound the actual file read.

The existing packed CLI budget is 2,000,000 bytes. Measure check:size before any CLI cutover;
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


M1 admission limits: timeoutMs applies to each execution separately (up to two
execution deadlines for a note), not to the whole mission. Correlation checks an
executor-supplied executionId; it is not authentication of the executor. The
transport adapter must bound incoming bytes before decoding: this object-level
runtime has no pre-parsing byte cap. The vertical bounds admitted inputs and
serialized note size, not transport memory. Exact quotation membership accepts
a single character and does not establish relevance or semantic support.

The package export remains doctor only; note is a private source application
seam, not a released package API. The accepted package ADR records the original
A5 sequence as provenance; the revised plan defers that cutover. No separate
publication is authorized.

## M2 native note entry

The private application entry can run the two-source note path through the installed
Claude Code CLI without making the generic runtime know a provider. Supply an input
JSON file, an explicit scratch cwd outside repositories, and two model names:

```text
node dist/application/cli.js note --input ./request.json --cwd /tmp/void-note-run \
  --extraction-model haiku --synthesis-model sonnet --timeout-ms 90000
```

The command performs extraction and synthesis sequentially, validates both untrusted
payloads with the same vertical schemas. Claude's native JSON Schema contract currently
accepts Draft-7, so the adapter asks Zod 4.4.3 to emit that target for both calls and
keeps the objects closed (`additionalProperties: false`). It prints the accepted note plus a receipt
of requested model, reported `modelUsage`, session id and non-hermetic native context.
The receipt is evidence from the CLI response, not absolute model or environment
attestation. Native user and managed settings remain enabled; the adapter does not
remove installed hooks or protections. The cwd and environment are explicit, but
the native runtime is not hermetic. A stopped result is printed as structured JSON,
including usage already observed for an earlier role, and exits 1. Native refusals are
classified into bounded public actions; raw stderr is never included. Process exit and
captured byte counts are retained only for otherwise-unclassified failures. Invalid CLI arguments or input files exit 2. Docker, durable recovery,
and live model quality certification remain outside this tranche.

### M2 observation receipt

The executable pipeline is two sequential native calls: extraction from the two supplied
sources, then synthesis from the admitted extraction. Each response is untrusted and is
validated by the sourced-note vertical before the next call or final receipt. Requested
models, native `modelUsage` when present, session identifiers and role are recorded as
observations; they are not absolute model attestation. Each role has its own caller
deadline, and the adapter does not retry or claim remote termination after cancellation.

The first two bounded live attempts stopped during extraction with exit 1 and no accepted
model result. The confirmed native diagnostic reported stdout 0 bytes, stderr 122 bytes,
and the public refusal that the generated Draft 2020-12 JSON Schema was unavailable.
The adapter now emits the supported Zod Draft-7 target; the earlier concrete `-p`
argument change remains a separate hypothesis and is not recorded as the root cause.
The final live observation is pending and must use a fresh scratch cwd, explicit native
settings and the child environment allowlist. User and managed runtime context remain
non-hermetic by design. Docker execution and durable recovery remain deferred.
