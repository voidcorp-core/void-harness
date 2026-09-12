# Worker telemetry roots (DEV-738)

Correct the unsupported Codex spawn environment requirement before dispatching
the authorized eight-ticket batch. The host's actual native tool schema exposes
no environment parameter. A prompt export does not configure runtime hooks.

## Boundaries

- Reuse `packages/cli/src/lib/project-roots.ts` through the lower hook-runner
  package; preserve CLI exports and behavior, with one implementation.
- Keep enforcement and lifecycle context rooted in the current worktree.
  Redirect only canonical hook/runtime events and their existing correlation IDs.
- A linked worktree without its own install receipt uses the main working tree
  only when Git verifies that destination. Independent installs retain their root.
- Standalone projects and ordinary main checkouts need no Git subprocess for
  telemetry discovery. Explicit root environment inputs remain compatible.
- An ambiguous linked identity never falls back to disposable telemetry while
  claiming centralized success. No permissions or installed floor are changed.

## Preparation review corrections

Root discovery is resolved at most once per hook invocation. Ordinary linked
worktrees verify Git's bounded gitfile, commondir and reciprocal gitdir chain
without subprocesses. Exceptional-layout Git inspection has a 100 ms aggregate
deadline; each subprocess receives only the remaining time. The existing CLI keeps its
current bounded behavior. Timeout/unavailable Git yields a typed unresolved-root
result. Measure the exact hook path, including the linked-worktree case; this
deadline is a bound, not a claim of meeting performance budgets.

Concurrent regression exposed process startup exceeding that budget. The
metadata identity path removes the source of contention without raising timeouts.
Nested policy configurations do not change repository identity; only an
independent installation receipt establishes a distinct telemetry root.

The packed CLI measured 901.1 kB after this correction, exceeding the former
900 kB ceiling by 1.1 kB. The declared ceiling is 920 kB to accommodate the
verified identity and journal behavior with bounded headroom. No package
content, test gate, timeout, or consumer guarantee is removed to meet the budget.

Both unresolved destination and write failure emit one bounded diagnostic to
stderr, naming distinct stable codes and corrective actions, without payload,
environment, raw exception, or private path. Advisory telemetry failures preserve
the enforcement exit code and stdout protocol. Neither a swallowed promise nor a
successful enforcement result is evidence that telemetry was written. Existing
writer sequencing, locking and corruption checks remain unchanged.

## Implementation and verification

1. Commit failing native hook regressions without root environment overrides.
2. Move the existing resolver behind a shared lower boundary and retain CLI
   compatibility tests; add bounded telemetry resolution and typed refusals.
3. Wire both CLI event paths, keeping policy evaluation rooted locally. Replace
   unavailable spawn instructions in both runtime adapters and their tests.
4. Prove main/nested/linked roots, independent installs, submodules, standalone
   projects, malformed/unknown Git identity, unavailable destination and timeout.
5. Observe real canonical events from separate worktrees, retained after worker
   disposal; prove existing concurrent writer sequence/correlation behavior.
6. Regenerate the shipped bundle and mirrors, review the complete diff, run
   targeted tests and repository checks, then merge only after current CI passes.

The first preparation mission stopped because its context omitted the resolver
and consumers. The replacement preparation includes those sources; neither run
is evidence of implementation success. Consumer adoption of a source repair is
separate from source conformance and never achieved by replacing the active
released safety floor with working-tree output.

## References

- [Git worktree porcelain](https://git-scm.com/docs/git-worktree#_porcelain_format)
- [Git root queries](https://git-scm.com/docs/git-rev-parse)
- [Official Codex subagents](https://developers.openai.com/codex/subagents)
- Existing root compatibility tests: `packages/cli/src/lib/project-roots.test.ts`.
- Hook entry points: `packages/hook-runner/src/cli.ts` and
  `packages/hook-runner/src/record.ts`.
