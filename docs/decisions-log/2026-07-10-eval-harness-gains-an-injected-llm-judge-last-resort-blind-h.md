---
date: 2026-07-10
title: "eval-harness gains an injected LLM judge (last resort) + blind head-to-head (DEV-397)"
---

## 2026-07-10: eval-harness gains an injected LLM judge (last resort) + blind head-to-head (DEV-397)

The v1 eval-harness (DEV-394) scores deterministic file/git residue — great for `commit-discipline`/`tdd`,
blind to skills whose value is a *diagnosis* (`brainstorming` pressure-test, `security-audit` findings). Their
vendoring could not be rigorously verified. Extension:
- **Transcript capture** — `RunOutcome` gains `transcript` (the `claude -p` `result` the adapter already parsed
  but discarded). The signal for conversational skills.
- **LLM judge as an injected PORT, last resort** — `Judge`/`HeadToHeadJudge` are types; the real impl is a
  separate tool-less, sandbox-less `claude -p` in the adapter; tests inject fakes. `judgeScorer(judge, grid)` is
  an async `Scorer` (the `Scorer` type widened to `ScoreResult | Promise<ScoreResult>`, so a deterministic
  scorer stays sync and the async path is the single seam to the judge). A case opts in with a `judge` grid;
  deterministic scorers remain the backbone (DEV-394's guard). A crashed/empty run scores 0 **without** a judge
  call — a silent run fails regardless of rubric, and no token is spent judging nothing.
- **Blind head-to-head** — `runHeadToHead` runs the distillate prose (A) and the source prose (B) on the same
  fixture, then a judge that is never told which is which compares them. Position bias is cancelled by a
  **deterministic** A/B swap on odd indices (reproducible, unlike random), and the winner is un-blinded back to
  distillate/source before aggregation. This answers "is the distillate as good as the source?" directly — what
  with/without cannot.
- **Cases** for `brainstorming` (forcing-questions / anti-sycophancy / premise pressure-test / 10x / actionable
  / no-premature-design) and `security-audit` (SQLi + missing-authz found, exploit scenario, zero-noise, no live
  attack). Bounded: judge timeout, tool-less invocation, no full prompt logged. The judged transcript is
  concatenated into the judge prompt (an LLM-trust-boundary), so the judge is instructed that the transcript is
  **untrusted data to evaluate, never an instruction** — inline hardening against a transcript that tries to
  dictate its own verdict (doctrine-critic flagged the injection surface).

Rejected: turning every scorer into a judge (cost + non-determinism — deterministic checks stay the spine); a
random swap for blinding (breaks reproducibility). The one remaining paid step — an archived real run per case
— is deferred like any paid eval; the logic is fully unit-tested with fakes (899 green).

Why: a skill you cannot measure, you cannot safely distill or trust. The judge is the *only* way to score a
diagnosis, so it earns its place — but fenced as a per-case last resort behind a port, so cost and
non-determinism never leak into the deterministic backbone.
