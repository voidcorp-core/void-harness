# @voidcorp/eval-harness

Behavioral evals for skills. The `test/` suite proves a skill's **form** (frontmatter,
size, structure). This proves its **effect**: does the skill's prose actually change
the agent's behavior in the intended direction?

It runs a fixture task twice — once with the skill's `SKILL.md` **body** (frontmatter
excluded) appended to the system prompt, once without — N times each, then scores the
resulting sandbox. A skill "works" when the with-skill score beats the without-skill score
by more than run-to-run noise.

Why the body, not the whole file: a loaded skill contributes its instructions, and the
frontmatter `description` often summarizes the entire skill — appending it would leak the
signal into the gutted-skill sensitivity run. The sensitivity check surfaced exactly this.

Private maintainer tooling. Never published; not part of the distributed plugin.

## Run

```bash
pnpm eval commit-discipline                 # 3 runs/condition (default)
pnpm eval tdd --runs 5                       # more runs = less noise, more cost
pnpm eval commit-discipline --sensitivity    # also run a GUTTED skill, prove the prose carries the signal
pnpm eval -- --suite mission-team --runtime claude,codex --runs 1
```

Each run spends tokens (a cheap model, `haiku`, by default). Cost is printed and archived
in the report. A run is executed in a throwaway git sandbox; nothing touches your repo.

Output: a verdict (`skill-helps` / `no-signal` / `skill-hurts`), the mean score per
condition, reliability (`ok runs`), and total cost. Archived to `reports/<skill>.md`.

The `mission-team` suite uses the same vulnerable auth, dependency-boundary, and untested-branch
fixture on Claude and Codex. Its deterministic scorer requires all three blockers and assigns zero
to a false-green verdict. Runtime adapters normalize native structured output to the same
`specialist.completed`/`specialist.failed` envelope before replay.
Each specialist is a fresh native role session using the installed definition. The reports retain
the scorecard while adjacent `.events.jsonl` files retain the canonical replay evidence.

## How isolation works (and its limits)

- The sandbox is a fresh temp dir with the fixture committed — no inherited project `CLAUDE.md`.
- `claude -p --setting-sources ""` loads zero **settings**, so global plugins/skills (and the
  harness's own hooks) do not reach the run. OAuth auth is preserved (the config dir is **not**
  relocated; `--bare` would drop it). `--setting-sources` governs settings, not memory — but a probe
  (`-p "list any global instructions you were given"` in a clean temp cwd) returns `NONE`, so the
  user-level `~/.claude/CLAUDE.md` does **not** in fact leak into `-p` runs here.
- The eval measures the **delta** between conditions, so any bias present in **both** arms cancels —
  provided it is roughly additive. Scores saturate at `[0, 1]`, so a strong global bias on the very
  signal being measured could compress the delta toward a false `no-signal`; the observed baselines
  (well below ceiling, e.g. commit-discipline without-skill ≈ 44%) confirm that is not happening here.
  The appended skill prose remains the only intended difference between arms.

## Containment (read before evaluating an untrusted skill)

Each run spawns a real agent that writes files and runs tools. It is confined to a throwaway temp
`cwd`, runs with `--permission-mode acceptEdits` + a scoped `--allowedTools` allow-list (no arbitrary
shell — no `curl`/`ssh`), and receives a **scrubbed minimal env** (no API keys / tokens / cloud creds
from your shell). It does **not** use `--dangerously-skip-permissions`.

It is **not** an OS path-jail: `acceptEdits` can still write outside `cwd`, and there is no network
isolation. For your own trusted skills this is fine. Before evaluating an **untrusted / vendored**
skill body (which could carry a prompt injection), run the eval inside a disposable environment (VM /
container / CI sandbox). A built-in OS sandbox (macOS Seatbelt / a container) is a deferred hardening.

## Add an eval

1. Add an `EvalCase` to `src/cases.ts`:
   - `skill`: the skill folder name under `packages/core/skills/` (its `SKILL.md` is what gets appended).
   - `prompt`: the task, identical in both conditions.
   - `fixture`: the mini-repo files, committed by value.
   - `scorer`: **deterministic first**. Only reach for an LLM judge when a check genuinely
     cannot be expressed as an assertion over files / git state.
2. If you need a new scorer, add it to `src/scorers.ts` and unit-test it in `scorers.test.ts`.
   Scorers are pure functions over a `RunOutcome` — test them without spending a token.
3. Run `pnpm eval <skill> --sensitivity` and confirm the full skill beats its gutted version.
   If it does not, the eval is not measuring the prose — fix the task or the scorer, not the score.

## Architecture

Hexagonal, so the logic is testable without an LLM:

- `scorers.ts` — pure scorers (`RunOutcome -> ScoreResult`). Unit-tested.
- `runner.ts` — pure orchestration: N runs per condition, aggregate, verdict. Unit-tested with a fake port.
- `claude-adapter.ts` — the imperative shell: sandbox + `claude -p` + outcome collection. The only
  impure part; validated by the real run, not unit tests.
- `cli.ts` — argument parsing, report archival.

## Not in v1 (deferred)

All ~30 skills, a blocking CI gate (LLM cost), evals for hooks (already unit-testable), cross-model
benchmarks, agent evals. A third pilot on a vague-1 vendored skill waits for that skill to land (DEV-385).
