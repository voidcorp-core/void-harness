# Autopilot journey fixture

Replay the real DEV-832 cluster path in isolated worktrees. Integrate only
verified worker commits, preserve the union-review gate, and never promote the
result to the deploying branch without the explicit human decision.

Use `integration-target.md` as the bounded work item. Produce
`integration-result.md` with the observed worker and integration result, and
include the exact phrase `human promotion decision pending`. The result must
describe what was actually observed; do not claim that a deployment occurred.

The fixture is a bounded task description. It contains no consumer source,
credentials, dependency lockfile, or private project data.
