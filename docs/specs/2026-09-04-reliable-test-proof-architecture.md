---
title: Reliable test proof architecture
date: 2026-09-04
status: approved
author: Folpe + Codex
ticket: DEV-821
related:
  - docs/specs/2026-08-31-autonomous-until-develop.md
  - docs/specs/2026-09-04-minimal-consumer-contract.md
---

# Reliable test proof architecture

## Objective

Implement and Autopilot may treat a green test result as authorization only when the instrument is
deterministic, hermetic and bound to the exact artifact under review. The repository therefore
optimizes for trustworthy evidence, not for the largest possible test count.

## Measured baseline

On 2026-09-04 the repository contained 410 test files, about 60,184 test lines and 4,779 collected
tests. A bounded two-worker run showed that 73 subprocess or network files, about 18% of the suite,
consumed about 91.5% of summed file time. The current host contained 6,896 matching temporary test
directories and 54,853 project-registry pointers after repeated runs.

The host is a MacBook Air M3 with 8 cores and 24 GB of memory. It is adequate for the development
loop, but its disk was 94% full and sustained subprocess-heavy execution competed for the same CPU,
filesystem and thermal envelope. A larger machine would reduce wall time without correcting the
undeclared inputs, duplicate proof or oversubscription that makes the result unstable.

## Decision

Every test has exactly one proof tier and one resource class. The two dimensions stay independent:

| Proof tier | Question answered |
| --- | --- |
| `pure` | Does the deterministic model implement its invariant? |
| `contract` | Does one adapter preserve its public boundary? |
| `consumer` | Does the packed package work through its public surface? |
| `system` | Does the deployable artifact complete a critical journey? |
| `certification` | Does the system survive real runtimes, faults and repeated stress? |

| Resource class | Scheduling rule |
| --- | --- |
| `cpu` | May use measured parallelism. |
| `filesystem` | Uses a run-owned sandbox and bounded workers. |
| `subprocess` | Uses a minimal environment, bounded output and low worker count. |
| `network-browser` | Owns a readiness signal, port and teardown. |
| `external-state` | Uses a unique namespace and idempotent cleanup. |

Classification is expressed once in the Vitest 4.1 project configuration and derived checks. Local
scripts and GitHub Actions consume the same gate catalogue rather than maintaining parallel lists.
Unknown or multiply classified tests fail closed.

## Local and remote execution

The Mac owns the fast feedback loop. `test:fast` runs pure and contract proofs; `test:component`
runs filesystem and bounded subprocess proofs. Neither command depends on network services or the
speed of a compiler hidden inside an assertion.

GitHub Actions owns reproducible cross-platform consumer evidence. The package is built and packed
once per exact SHA, then the immutable tarball is reused by independent Linux, macOS and Windows
jobs. System tests exercise the production artifact with hermetic adapters. Certification,
subscription runtimes, repeated stress and fault injection run on scheduled or release lanes, not
on every editing loop.

Correctness never depends on a wall-clock performance threshold on a shared host. Performance is
recorded on ordinary pull requests and becomes a gate only in a controlled benchmark lane with a
documented sample and variance policy.

## Proof ownership and deletion

One invariant has one exhaustive owner at the lowest faithful boundary. Higher tiers prove wiring
and artifact identity only. When a command, adapter, process and packed test assert the same domain
matrix, the higher tests shrink to one representative path or are deleted.

The first deletion targets are:

- detailed Autopilot decisions duplicated between command and domain-module tests;
- one Bash test suite per hook rule when pure rule tests and one table-driven adapter contract
  already prove the behavior;
- workflow source-text assertions when a parsed semantic contract owns the same fact;
- configuration-agreement tests whose duplication is removed by the common catalogue.

Unique rollback, security, portability and integrated-composition properties remain. Deletion is
accepted only after the surviving owner is named and its focused test is green.

## Fixture containment

Tests allocate external resources through one small support boundary. A run owns one temporary
root, one fixture-local Void global directory and explicit process/server registrations. Teardown
is idempotent and executes after failures. Child processes receive an allowlisted environment;
ambient dotenv files, credentials and home-directory state are undeclared inputs and invalidate an
exact-CI claim.

A completed run leaves no new fixture tree, listening port, child process, user-home write or
external namespace. A bounded cleanup command handles residue from interrupted historical runs
without recursively deleting an unresolved parent.

## Failure policy

- No retry, rerun-on-failure, quarantine, skip or raised assertion timeout may produce green.
- Sleeps and scheduler-order assertions are replaced with observable readiness, event barriers or
  injected clocks.
- Each CI command owns its exit status; missing result evidence is a failure.
- Stress runs record the exact SHA, proof tier, resource budget, attempt and shuffle seed. Any
  occurrence remains red and reproducible.
- A system test preflights the production configuration before browser navigation and reports a
  stable configuration error rather than a downstream timeout.

## Acceptance criteria

- [ ] Every collected test belongs to exactly one proof tier and resource class.
- [ ] Pure and contract lanes are deterministic and leave no external residue.
- [ ] Subprocess, network and external-state lanes have explicit measured worker budgets.
- [ ] Local verification and CI are rendered from one gate catalogue.
- [ ] Duplicate proof is deleted or fused with no lost invariant.
- [ ] The packed consumer artifact is built once and reused across its supported matrix.
- [ ] A fresh full run leaves no new temp fixture, project pointer, process or port.
- [ ] Twenty repeated fast-lane runs and ten representative complete stress runs produce no false
      green, missing collection or unexplained failure.
- [ ] DEV-808 resumes only after the instrument above is green on the integrated exact SHA.

## Non-goals

- Adding Bazel, Nx, Nix or a custom test framework.
- Making the Mac the release-certification authority.
- Reducing coverage by deleting a unique behavior contract.
- Moving every test to remote CI; the local loop must remain useful offline.

## Sources

- Vitest 4.1: https://vitest.dev/guide/projects
- Vitest performance profiling: https://vitest.dev/guide/improving-performance
- Vitest reporters and sharding: https://vitest.dev/guide/reporters and
  https://vitest.dev/guide/cli#shard
- GitHub Actions matrices: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
- Bazel hermetic test contract: https://bazel.build/versions/9.2.0/reference/test-encyclopedia

