# Skill audit: ticket-runner

## Why this skill exists

The harness had no single definition of "take one ticket and ship it at expert-team
quality." The behavior was implied (compose tdd, security, review by hand) and
partially duplicated inside `backlog-autopilot`'s inline per-ticket cycle. Result:
agents executing a ticket interactively skipped passes (E2E, UX, security, review)
under speed pressure, and the autopilot cycle drifted from what a careful human
would do.

## Baseline failure observed

In real use (DECLIK, 2026-06-26), tickets were implemented without an explicit
security or review pass, and "go fast" was read as "skip the expensive passes."
The failure is omission-under-pressure, not ignorance.

## Form chosen (per writing-skills "Match the Form to the Failure")

- **Recipe** for the pipeline: the cycle IS the output, a numbered ordered list of
  passes, each naming the skill it composes. Recipe beats prohibition for
  shape/omission failures.
- **Conditional keyed to an observable predicate** for triage: each pass fires on
  a checkable condition (touches a boundary / a UI / a trust edge), so "fast" is
  principled, not a loophole. This is the load-bearing design choice.
- **Discipline guard** (red-flags + rationalization table) only for the ALWAYS
  passes, because skipping those is a knows-better-skips-anyway failure.

## Deliberate decisions

1. Single source of truth: backlog-autopilot delegates here rather than keeping its
   own cycle (DRY, anti-overlap rule of the repo).
2. Composes existing skills/agents; reimplements none (anti-bloat).
3. `impeccable` preferred for the UX/UI pass when installed, with a graceful
   fallback to harness:frontend-design + accessibility-first + gstack design-review.
4. ALWAYS passes: ingest gate, TDD, security (quick scan minimum), review,
   verification, ship. Conditional: architecture, E2E, UX/UI.

## Open follow-ups

- Full writing-skills pressure-test suite (multi-pressure scenarios per pass) not
  yet run; the skill is grounded in an observed baseline failure plus a subagent
  application check. Schedule a dedicated RED-GREEN pass.
- Consider a companion hook that warns when a PR touches a trust-boundary file but
  no security-pass marker is present.
