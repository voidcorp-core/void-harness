---
schemaVersion: 1
id: "adr:ec77d2de-4719-4fe6-8d21-c0dbe403d6ac"
createdAt: "2026-09-21T16:42:42.199Z"
title: "Remove the native Void Machine without porting it, for lack of a caller"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Remove the native Void Machine without porting it, for lack of a caller

## Context

[The port decision](2026-09-19-void-machine-typescript-layer-ownership--e492e50e-86b0-4427-9fdf-2435750ce60d.md)
chose to port the Rust capabilities under `native/void-machine/` to strict TypeScript. Before
porting, a read-only inventory asked, for each capability, who calls it and what TypeScript already
covers. The answer, capability by capability, on 2026-09-21:

- **Doctor** (Git discovery, `machine.toml`, `machine.lock.json`): no caller in code. Covered by
  the private TypeScript package. Nothing produces either file, and the Rust repair hints named
  `void-harness machine` commands that do not exist. Verdict: retire, keep the private TypeScript
  doctor unexposed until a consumer asks.
- **Skill check**: only its own CI fixture called it, and it rejects every real skill, because it
  expects a `harness.yaml` shape the harness never used. Verdict: retire without port.
- **Git effects, commit observation, cluster reconciliation, merge policy, ledgers**: no caller
  outside Rust tests. Autopilot already runs TypeScript equivalents in production
  (`git-observation`, `cluster-plan`, `reconcile-plan`, `merge-plan`). Verdict: retire without port.
- **Public `void-machine` launcher and `VOID_MACHINE_BIN`**: voidharness 3.8.0 publishes the bin,
  but no native binary is distributed anywhere, so on a consumer machine it can only report the
  binary absent. Verdict: retire.
- **JSON schemas**: `durable-run-v1.json` guards production autopilot code and `doctor-v1.json`
  the TypeScript doctor. Verdict: move to their owners, done before this decision.

The native CI job was not a required check on `develop` or `main`.

A second audit compared the forty Rust behaviors with the live TypeScript. Most are covered, often
more strictly. Three ideas were worth keeping and are filed to be built in TypeScript, not ported:

- [DEV-858](https://linear.app/voidcorp/issue/DEV-858) (high): detect a worker write to the Git
  state shared by all worktrees (stash, tags, notes, remotes, local config) by comparing digests
  before and after the cluster. Today this is only an instruction to the worker.
- [DEV-859](https://linear.app/voidcorp/issue/DEV-859) (medium): bind green checks to the exact
  integration SHA in the merge decision, and read observed paths with `-z`.
- [DEV-860](https://linear.app/voidcorp/issue/DEV-860) (low, triage): a closed schema for
  `harness.yaml`, and the fate of the TypeScript effect ledger that has no caller.

## Decision

Delete `native/`, its CI job and the public `void-machine` launcher without porting any of it,
because no capability had a caller that TypeScript does not already serve.

This closes the port scope of the port decision; its layer ownership rules still govern
`packages/void-machine`, which keeps the `void-machine` name as a private package.

## Consequences

Positive:

- One language in the repository, and one CI toolchain less on three operating systems.
- The published CLI no longer advertises an executable that cannot run for a consumer.
- The ideas worth keeping are tracked as TypeScript work where their callers live.

Negative:

- Removing a published bin is a breaking change of the voidharness package, carried by the
  unreleased 4.0.0.
- Use of `npx void-machine` by third parties cannot be measured from the repository; anyone relying
  on it loses it without a deprecation release.
- Until DEV-858 ships, the shared Git state guard exists nowhere in running code, as before.

## Alternatives considered

- Port the Rust capabilities as decided on 2026-09-19: rejected, it would rebuild code with no
  caller and duplicate autopilot's production modules.
- Keep the Rust tree dormant: rejected, it keeps a second toolchain and a CI lane for code nobody
  runs, and the launcher keeps shipping a path that cannot work.
- Deprecate the launcher in a minor release first, then remove it: rejected, 4.0.0 is already a
  major release and the launcher has no working consumer path to deprecate.

## Reversal cost

Low. Reinstalling `voidharness@3.8.0` restores the launcher, and the Rust sources remain in Git
history. The native machine wrote no data, so neither direction needs a migration.
