# Official TypeScript worker: verification and performance

The harness owns `@typescript/typescript6` 6.0.2, locked to the official 6.0.3
compiler implementation. The consumer compiler is never loaded. Reconstruction,
syntax facts, policy, process isolation and asset delivery remain separate.

## Measurements and the approved deadline

All worker measurements use fresh Node processes, empty environment, 128 MiB V8
old-space, bounded input/output and the actual bundled worker. A small preloader
records child CPU and peak RSS before stdout is written. Wall time includes
startup and IPC; the profiler adds overhead. RSS is not V8 old-space usage.

The original one-second run failed **3 of 180 worker inspections** on Node 24.15.0
under local load. A diagnostic five-second run completed all 180 with a maximum
of **3,732 ms**. The user then explicitly approved **5,000 ms shared across the
operation**, not per file. A deterministic boundary regression failed before the
change at 4,999 ms and passed afterward; 5,000 ms refuses. A real non-cooperative
child is killed using its remaining budget. There are no retries.

The final Node 24.15.0 macOS arm64 run completed **180/180 worker inspections**
plus 30 Node baselines. Worker SHA-256:
`12e6a141d5bda6486f285da9af96d09c638ceb26a321f1362a1df064b8eefea3`.

| Case, 30 fresh processes each | Wall p50 | Wall p95 | Wall p99 | Child CPU p95 | RSS p95 |
|---|---:|---:|---:|---:|---:|
| Node baseline | 95 ms | 192 ms | 248 ms | 66 ms | 45.7 MiB |
| TypeScript, 28 bytes | 653 ms | 2,402 ms | 4,251 ms | 420 ms | 115.9 MiB |
| TSX, 54 bytes | 354 ms | 513 ms | 533 ms | 367 ms | 115.9 MiB |
| Large source, 37,779 bytes | 382 ms | 572 ms | 649 ms | 443 ms | 125.4 MiB |
| Invalid syntax | 316 ms | 427 ms | 467 ms | 354 ms | 115.3 MiB |
| Oversized request | 198 ms | 460 ms | 572 ms | 187 ms | 72.4 MiB |
| Actual Cortex source, 18,988 bytes | 414 ms | 528 ms | 606 ms | 447 ms | 119.6 MiB |

The slow TypeScript sample is retained. A five-second ceiling accommodates this
observed run; it cannot promise no refusal under every machine load. The gap
between wall and CPU time suggests contention but does not identify its cause.
Cases ran sequentially, so their load conditions differ. With only 30 samples
per case, the reported nearest-rank p99 is the maximum, not a stable tail estimate.

The same worker also passes **150/150 inspections** plus 30 Node baselines on
the minimum supported **Node 22.12.0**, macOS arm64. Maximum wall time is 2,074 ms
(large-source case); p95 is 706 ms for TypeScript, 429 ms for TSX and 1,600 ms
for large source. That run does not include the additional local Cortex case.

The diagnostic and final raw samples are archived locally under
`.void/machine/test-audit-2026-09-16/syntax-*.jsonl`. The first one-second raw JSON
was inadvertently overwritten by the final benchmark task's reused output path;
its failure count and summary measurements were recorded before that happened.
Do not claim a complete raw archive for that first run. Future runs need distinct
output paths. The failed observation is not treated as a passing run.

## Other observations

- Final `pnpm test`: 5,344 tests across 485 files pass. Workspace typecheck and
  targeted lint pass. The native independent static review
  `ts6-complete-static-review-20260916-09` has no remaining finding; it is not
  canonical mission certification or independently executed verification.
- Reject invalid envelopes before initializing TypeScript. Avoid parent pointers
  unused by traversal. Both optimizations retain the semantic test corpus.
- A disposable Node compile-cache experiment timed out in 23/31 cases. No cache,
  persistent service, extraction or dynamic evaluation was added to production.
- The parent hook benchmark passes its enforced budgets: hot p95 2.95 ms and
  feature-versus-noop CPU p95 9.19 ms. Its pre-existing global startup baseline
  tracked by DEV-662 is separate; this change does not claim to resolve it.
- Read-only Cortex dogfood passes the actual test and comment prose, refuses an
  executable focused test, and refuses malformed source. No consumer file changed.
- Actual `pnpm pack` measured 1,954.7 kB. The ceiling is 2,000 kB, preserving both
  assets and upstream license notices. Babel's previous measurement is obsolete.
- Identity checks refuse missing or incompatible workers. Claude health uses the
  configured installation and includes worker compatibility in wired evidence.

## Reproduction

Build with `pnpm hooks:build`, then run
`node packages/hook-runner/benchmarks/syntax-worker.mjs` with a unique output file.
An optional source filename adds a local case without reporting its contents.
`VOID_BENCHMARK_WORKER` selects an already installed worker for packed-artifact
measurements. Install conformance exercises the installed worker on the supported
CI operating-system matrix. Local evidence alone is not a claim of green CI on
Linux or Windows.
