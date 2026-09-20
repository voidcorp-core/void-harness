# TypeScript port: A0 parity register

Status: A0 inventory and baseline observed; A1 architecture cleared by ORCH; no production implementation yet.
Standalone local unit A0-A5. Writer WORK-1; panel provider ORCH.
Source HEAD: `cc2cb14a74f70acba18dd5fde2c1c9ce4a092c7f` (approved plan on
`85f177b1dc4638be75ccc9e265352698cc072969`). No source changes since `1efeedf1`
in native/void-machine, launcher, native doctor contract test, durable-run,
legacy oracle, CLI manifest or CI workflow (git diff inspected).

## Behavior, owner, destination and acceptance evidence

Destinations below are relative to packages/void-machine. They are not claims
that implementation exists. Each proof remains pending until linked to RUN output.

| Existing behavior/source | Owner and destination | Positive / refusal evidence required |
| --- | --- | --- |
| host/lib.rs repository discovery; core DoctorReport | Git adapter `src/adapters/git/repository.ts`, development doctor policy, application composition | Ordinary and linked worktree paths; outside Git blocked; absent Git; no writes; config/cache paths explicitly supplied |
| adapters/lib.rs machine config/lock validation | Format adapters and development doctor | Valid config/lock; malformed, unsupported version, unreadable file; degraded vs blocked dominance; closed v1 JSON report |
| cli/main.rs doctor | application CLI | Healthy exit 0, degraded/blocked 1, usage 2; parseable JSON only on stdout; human diagnostics on text path |
| adapters/lib.rs check_skill | File/format adapters, `src/verticals/development/skill-package.ts` | Exact two-file package; missing/unknown entry, directory-as-file, root/nested symlink, unreadable file, invalid UTF-8, duplicate/unknown manifest field, forbidden capability/permission |
| Skill manifest and package hashes | Skill package identity, Node crypto adapter | Fixed byte digest, LF versus CRLF and multibyte bytes, no normalization; sorted files; unchanged schema fields |
| core/lib.rs GitEffectRequest, effect_id | Development Git effect identity and validation | UTF-8 length prefixes, Rust lexical byte order, file duplicates retained in canonical input, revision u64 and ordinal u32 bounds |
| core/lib.rs claim/apply/ambiguous | Minimal generic effect state only if needed, Git validation in development | Positive fence, same-fence replay returns original proof; zero/stale fence, pending application, ambiguous repetition and applied-to-ambiguous refused |
| core/lib.rs validate_observation | Development Git proof policy | Full SHA, nonempty exact chain base to head, exact sorted footprint; merge, duplicate, invalid SHA, broken chain, shared mutation refused |
| host/git_effect.rs snapshots and commit observation | Git adapter + application composition | Real disposable Git repo, linked worktree, Unicode/space/newline paths, command failure; snapshots composed before proof; no writes by observer |
| core/cluster.rs reconcile_cluster | `src/verticals/development/cluster.ts` | Complete partial-success cluster; missing/extra/duplicate worker, no files/review, empty integration, collision refused; sequential overlap permitted, unowned widening allowed |
| core/cluster.rs ReconciliationLedger | Development in-memory acceptance | First accept then duplicate refusal; no claim of restart durability |
| core/merge.rs decide_merge and MergeLedger | Development merge policy; command construction in adapter | Protected nondeploy target, exact reviewed/check SHA and PR; production aliases, human gate, missing PR, invalid head, force, unknown protection, stale/failed checks, unavailable/stale review, sensitive paths, repeated merge refused |
| merge grant argv | `src/adapters/git/merge-command.ts` | Exact gh pr merge argv including --match-head-commit, no shell and no remote execution in tests |
| npm launcher | Existing packages/cli/bin/void-machine.mjs importing bundled candidate in A5 | Works without Cargo/native executable; exit/report contracts; explicit VOID_MACHINE_BIN migration refusal |
| Three schemas + read-only fixture | Package schema/ and fixtures/ in A5 | Preserve public $id and fields; update the two direct test consumers; no legacy journal rewrite |
| durable-run.ts, existing SQLite state | Legacy CLI autopilot remains authoritative | Existing v1 read/transition/recovery proofs retained; authoritativeEffects stays 0; no import into new core |

## Actual consumers and dependencies

- `packages/cli/package.json` owns the npm bin. Its published files are bin/dist,
  core-assets and docs, not the Rust source. `tsup.config.ts` currently builds
  only src/main.ts; A5 must include Machine and bundle runtime dependencies.
- `packages/cli/src/lib/native-doctor-contract.test.ts` consumes doctor-v1 schema
  and asserts native.binary.absent. Replace that obsolete fallback assertion at
  A5 with direct packed execution. No production TS consumer of the Rust library
  functions was found; their public Rust exports are characterized by tests.
- `packages/cli/src/lib/autopilot/durable-run.test.ts` consumes durable-run-v1 by
  file path. `commands/autopilot.ts` imports durable-run.ts; its state is not a
  general mission model. Keep ownership and reader, change schema location only.
- `.github/workflows/ci.yml` native-doctor job runs fmt, workspace tests, clippy
  and skill check on Linux/macOS/Windows. Replace this coverage, not its platform
  breadth. A0 runs the Rust corpus once; A5 exercises packed TS on those platforms.
- `conformance/machine/legacy-v3/{schema,manifest}.json` and CLI legacy-oracle
  reader describe 24 legacy harness scenarios (install/update/collision/receipt,
  runtime, skill, autopilot). They are not a Rust CLI test suite and are retained,
  not imported into the new Machine core.
- `packages/cli/README.md` documents VOID_MACHINE_BIN; update at cutover.
  `scripts/build-skill-references.mjs` names the product; refresh its description
  when native wording is retired, without changing historical ADRs.
- Node minimum remains the published `>=22.12`, not the older tsup node20 target.
  pnpm is pinned 10.34.5. Lockfile resolves CLI TypeScript 5.9.3, Vitest 4.1.9,
  tsup 8.5.1, tsx 4.22.4, YAML 2.9.0 and Zod 4.4.3. No TOML parser is currently
  locked. Select/read official versioned docs before A1 dependency/config edits.
- At initial inventory the worktree had no node_modules and no installed
  PHILOSOPHY copy. RUN has since installed dependencies without scripts. Active doctrine
  read from the main checkout; neither active installation nor shared Git config
  is changed. No lifecycle script was executed.
- DEV-807 foundation document absence is recorded in the supervised-design spec.
  No additional document was found by the scoped reference search; it does not
  block the explicit A0-A5 mandate or justify reconstructing that programme.

## Canonical contracts and deliberate corrections

Effect canonical text joins runId byte-length prefix, unitId byte-length prefix,
unsigned decimal revision, unsigned decimal ordinal, payload byte-length prefix,
and sorted length-prefixed declared files with newline separators. Hash prefix:
`effect-v1:sha256:`. Rust strings sort by UTF-8 bytes; JS localeCompare is unsuitable.
Use bigint for u64 (0..18446744073709551615); ordinal remains bounded u32. Any new
JSON boundary uses decimal strings for u64 rather than rounding past 2^53.

Skill identity concatenates `SKILL.md\n<byte-count>\n<raw-bytes>` and then
`harness.yaml\n<byte-count>\n<raw-bytes>`, with no extra separator. Current fixture
hashes calculated independently with Python hashlib and confirmed by Rust RUN:
manifest `7b4a1bae0563803313f4ce8e46e99faf6838a825279e099318d32d4695966322`;
package `0aee030b8ddb7b32ca4157a55dbee718755bafa9e92d2bd7455ca6e0869f8b27`.

Corrections to test rather than preserve:

1. Rust lock parsing accepts a substring instead of JSON (including schemaVersion
   10); use JSON parsing plus version/type validation. TOML parser must parse TOML,
   not split lines on equals; retain known-field/type checks.
2. YAML scanner does not validate schemaVersion/kind/value types and rejects legal
   block lists. Use maintained parsing plus a closed, read-only manifest schema;
   valid syntax never expands permissions. Duplicate keys remain forbidden.
3. Rust directory iteration flattens read failures, Git diff splits filenames on
   lines, and observe_commit_range supplies empty shared mutations. Preserve
   failures and use NUL-delimited paths plus actual composed before/after snapshots.
4. Repair strings mention machine config/lock commands absent from the CLI. Replace
   them with actionable manual repair text; machine-readable finding codes remain.
5. Explicit VOID_MACHINE_BIN is refused with migration guidance at A5. No recursive
   lookup of the launcher's own name, runtime download, or alternate engine choice.
6. Runtime paths are injected. CLI may resolve explicit environment defaults at its
   outer edge; absence of HOME/terminal/macOS must not prevent operation.

## Evidence observed on 2026-09-20

ORCH executed the six requested commands sequentially in cockpit RUN, in this
exclusive worktree. WORK-1 read the result manifest and stdout/stderr logs. The
request and raw logs live in `.void/machine/typescript-port/`; they are local
execution evidence, never build inputs. Commands are retained in
`a0-run-results.json` and `verify-request.md`.

| Operation | Exit / observed outcome | Wall seconds | Maximum RSS bytes |
| --- | --- | ---: | ---: |
| Harness doctor --no-remote | 0; shadow, self-host not-installed, receipt missing/invalid | 0.147 | 84,213,760 |
| pnpm install --frozen-lockfile --ignore-scripts | 0; dependencies prepared, no pnpm lock change | 1.564 | 341,491,712 |
| Rust workspace corpus, jobs=1 / test-threads=1 | 0; 28 tests passed, none failed/ignored | 6.522 | 173,211,648 |
| Rust skill check, retained fixture | 0; valid, exact package/manifest hashes above, no findings | 0.429 | 1,818,624 |
| Rust doctor --json | 0; healthy, linked worktree root and common Git directory correct, no findings | 0.194 | 4,390,912 |
| Public CLI contracts, maxWorkers=1 | 1; exactly three expected behavioral failures | 2.207 | 194,854,912 |

Walls come from the RUN result manifest; memory is macOS `time -l` maximum RSS.
This is not aggregate process-tree memory, a count of launched processes, a
portable performance comparison or evidence of TypeScript speed. Process count
was not measured. Rust corpus duration includes compilation. Harness doctor exit
0 does not establish full install health; no install repair was attempted.

Public RED is behavioral: doctor returned native.binary.absent instead of
 git.missing; skill exited 1 instead of 0; unknown command exited 1 instead of 2.
All three tests were discovered and executed; no missing import or fixture caused
failure. These contracts intentionally stay RED until the A5 public switch.
Focused candidate A1 tests must independently be observed RED before A1 code.
The launcher and Rust sources remain unchanged, so no baseline rerun is needed.

Baseline command:

```sh
env CARGO_BUILD_JOBS=1 cargo test --manifest-path native/void-machine/Cargo.toml --workspace -- --test-threads=1
```

Cargo generated an untracked `native/void-machine/Cargo.lock`; it is preserved as
baseline residue, not hand-edited or included in this documentation/test change.

### Local evidence digests

These SHA-256 values bind the exact logs read, without committing machine paths.

- `a0-run-results.json`: `69183471cfdc6459ec6f112dee5be87905cbbeeb140d2ce2d64356875f6cdeb8`.
- `rust-baseline.log`: `a9b7381d436f16ef2afe80b29815c4507ed2543a3ff5791990f4bd09e9386a86`.
- `rust-skill.json`: `f1ea680b45fd42edad3cab9147a4283f0876a4ebff95d5fcfabbc38d25c6af09`.
- `rust-doctor.json`: `2ab0fd61609f9136d07dbb88dcc25a248ee31918123e8ba9e96ec3ba00ebc158`.
- `public-contract-red.log`: `4a1c0d65800fa09f4ffaab6604b716ce7086c71605a74a8512d30a369185091f`.
- `public-contract-red.log.stderr`: `79597f9b8a89b850dd0507a3e8a32978cf76e41f47c17ceb3a962b597fdd71c0`.

## Next boundary

ORCH relayed architecture review with no BLOCKER. WORK-1 owns the package ADR,
focused doctor contracts and implementation. No structural or
production code has been written. Lint/typecheck and full TS suite are not claimed;
this handoff records inventory and expected RED, not a green implementation.
No UI or production observability change exists in A0.

No Rust source is removed until completed parity evidence and independent review
allow A5. Rollback is an explicit prior package pin, with existing state and
journals preserved; active installation is outside this mandate.

## Architecture disposition (ORCH relay, 2026-09-20)

All five observations accepted within A; none requires a new scope or publication:

1. A1/A2 render present nullable fields at one JSON boundary using a justified
   allow-null marker. Compare parsed report values against closed schemas, not
   stdout bytes; byte equivalence applies to identities only.
2. A2 sorts directory entries before finding production. Multi-finding cases
   check code membership as well as deterministic repeat output; OS iteration
   order is not a Rust compatibility obligation.
3. Distribution remains one private package bundled into the existing voidharness
   CLI. TOML parsing warrants a maintained parser even for three known keys:
   syntax/duplicate-key correctness cannot be replaced by another local scanner.
   Measure pnpm check:size before cutover against the existing 2,000,000-byte
   tarball ceiling; do not remove a parser or raise that ceiling without evidence
   and an explicit disposition. No separately published Machine package.
4. The retained fixture identities are now observed in RUN Rust output, above.
5. Cache selection preserves XDG_CACHE_HOME, then HOME/.cache, then repository
   .void/machine/cache. Environment is explicit input to the application; only
   the CLI edge reads process.env. Windows USERPROFILE is not substituted.

No coordinator port/type/field or core layer is introduced. Runtime agents and
models remain external to A. TOML/lock corrections require real repository cases
showing degraded exit 1 before the A5 switch; no silent health compatibility claim.
