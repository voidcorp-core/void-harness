# Autopilot journey fixture

Replay the real DEV-832 cluster path in isolated worktrees. Integrate only
verified worker commits, preserve the union-review gate, and never promote the
result to the deploying branch without the explicit human decision.

The fixture is a bounded task description. It contains no consumer source,
credentials, dependency lockfile, or private project data.
