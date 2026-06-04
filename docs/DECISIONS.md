# Decisions log

Non-obvious decisions taken on the harness itself, where a credible alternative
existed. One entry per decision. Newest first. See CLAUDE.md meta-rules.

## 2026-06-04: check points to `void-harness update`, not `/plugin marketplace update`

Context: field usage — `void-harness check`/`doctor` measure drift between the
`.void/config.json` pins and the marketplace HEAD, but `check`'s suggested remedy
was `/plugin marketplace update` (the Claude Code in-session command). That
command refreshes the loaded plugin but does NOT rewrite `.void/config.json`, so
`check` kept reporting drift even right after the user did exactly what it said.

Decision: `check` now points to `void-harness update`, which is the single
gesture that resolves the measured drift — it fast-forwards the marketplace cache
AND bumps the `.void/config.json` pins, then tells the user to restart Claude
Code. (`update` already did both; only `check`'s advice was wrong.)

Alternatives rejected:
- Make `check` itself bump the pins: a read-only "check" should not mutate; the
  mutation belongs in `update`.

## 2026-06-04: review fixes round 3 + honest reframe of the "safety floor"

Context: a multi-agent review of the PR found real holes, three of which were the
same systemic defect: a control duplicated across two representations where one
copy was updated and the mirror forgotten.

Confirmed-live fixes:
- **block-dangerous-bash** missed capital `-R` (`rm -Rf /`, `rm -R ~`) because the
  recursive clause matched lowercase `r` only while chmod used `[rR]`. Now `[rR]`.
- **protect-sensitive-files** let Codex's `shell` argv-array payload through (only
  a string command was handled, though its sibling block-dangerous-bash already
  handled arrays). Now joins arrays before scanning, and matches filenames
  case-insensitively (`.ENV`, `Credentials`, `.KEY` on a case-insensitive FS).
- **install --global** built the global manifest from a hardcoded 9-hook map that
  had drifted from plugin.json (shipping a global install with none of the new
  hooks). Now derives the hook wiring verbatim from the committed plugin.json
  (commands already use ${CLAUDE_PLUGIN_ROOT}), so it can never lag again.
- **autonomous-backlog render_prompt** used `sed s|...|$VALUE|`, which a `|`/`&`
  in a free-text config value (LINEAR_SCOPE) would corrupt, silently
  circuit-breaking the loop. Switched to bash parameter-expansion replacement
  (values treated literally).
- **doctor** now checks AGENTS.md, not only CLAUDE.md (the PR made AGENTS.md a
  maintained sister doc).

Design reframe (the important one):
- **block-dangerous-bash is reframed from "non-skippable safety floor" to a
  best-effort guardrail.** A regex blocklist of catastrophe shapes will never be
  complete (three review rounds found $HOME, -R, find -delete, git push +) and
  gives false confidence. The real deny-by-default floor for unattended runs is
  the scoped allowlist + sandbox (settings.autonomous.json). The hook is the
  secondary tripwire. docs/CODEX.md and the autonomous skill now say so.

Removed as inert:
- **precompact-doctrine hook deleted.** PreCompact has no decision control and
  cannot inject additionalContext (per the hooks docs), so the re-injection never
  happened. SessionStart fires with source `compact` after a compaction and DOES
  support additionalContext, so sessionstart-context already covers it. Shipping
  an inert hook is the same "documented fiction" anti-pattern we keep removing.

Alternatives rejected:
- Extend install.ts's hardcoded hook map instead of deriving from plugin.json:
  keeps the duplication that caused the drift. Derive from the single source.
- Keep block-dangerous-bash labeled a "floor": dishonest about a leaky blocklist;
  trains operators to keep the all-or-nothing override on.

## 2026-06-04: resolve the pack .source debt (backfill all + gate it)

Context: 27 pack skills lacked a co-located `.source`, leaving the "one .source
per skill" rule violated and unenforced — the same rules-rot pattern as the
sync-agent-docs fiction.

Decision: chose backfill-all over exempting packs. The load-bearing reason: a
`.source` ships with the skill (it lives under packages/**/skills/<name>/ and is
distributed via the marketplace), whereas the audit note in plans/ does not. So
`.source` is the *provenance that travels to consumers* — pack skills ship too,
so exempting them would ship skills without provenance. A uniform rule also
avoids an asterisk in the doctrine.

- Backfilled all 27 pack `.source` files, derived strictly from each skill's
  existing audit note (no fabricated URLs). Finding: most pack audits, unlike
  core, have no "Sources audited" table — those skills are genuinely `native`
  concretizations of a pack module, recorded honestly as such.
- Added an anti-bloat gate: every skill (core + packs) must have a co-located
  `.source` AND a plans/skill-audits/<name>.md note. Verified fail-closed.

Alternatives rejected:
- Exempt pack skills from `.source` (audit-note-only): ships pack skills without
  travelling provenance, and adds a special-case to the rule.
- Auto-generate `.source` without reading the audits: risks fabricated
  attributions. Derived from the real audit content instead.

Follow-up (optional): pack audit notes lack the "Sources audited" table the core
notes use; backfilling those tables with real upstream doc URLs would enrich the
provenance further. Not blocking.

## 2026-06-04: review fixes round 2 — $HOME rm/chmod, add/remove parity, doc honesty

Context: a second self-review found more real defects.

Decisions:
- **block-dangerous-bash** missed home-rooted targets. Factored shared target
  patterns: HOME_ROOT `(/ ~ $HOME ${HOME})` each with an optional trailing `/`
  and/or `*`, so `$HOME/`, `${HOME}/`, `~/*`, `$HOME/*` and the chmod/chown
  equivalents now block, while `$HOME/projects`, `~/.cache/x`, `/tmp/x`, `build/*`
  still pass. Tests added for each; the chmod check now requires a recursive flag
  AND a home/root target.
- **add / remove** patched only CLAUDE.md, leaving AGENTS.md stale and breaking
  the sister-doc parity rule. Both now call patchAgentsMd too. Regression test
  added (`test/cli/add-remove-parity.test.ts`).
- **ARCHITECTURE.md** overclaimed that `init` wires the sync pre-commit hook into
  consumer projects (it does not). Reworded: the parity gate is a harness-repo
  concern (`.githooks/` + CI); `init`/`add`/`remove` keep the two consumer docs in
  parity, and a consumer opts into the hook by pointing `core.hooksPath` at the
  shipped `.githooks/`.
- **capture-rule** shipped without an audit note (violating "one audit note per
  skill"); backfilled `plans/skill-audits/capture-rule.md` and added its
  decision-matrix row.

Known debt (NOT fixed this round, tracked): 27 pack skills lack a co-located
`.source` file. Their sourcing is recorded in their `plans/skill-audits/*.md`
notes. Resolution pending a deliberate choice: backfill each `.source` from its
audit note, or amend the sourcing rule to make `.source` mandatory for core
skills + agents and satisfied-by-audit-note for pack skills. Not auto-generated to
avoid fabricated attributions.

## 2026-06-04: review fixes — Codex shell gating, rm variants, anti-bloat scope, agent .source

Context: a self-review found real defects in the round-2 work.

Decisions:
- **block-dangerous-bash** now gates Codex's `shell` tool (was `Bash`-only, so the
  Codex hooks.json routing was inert) and reads an argv-array command. Its rm
  detection was rewritten to a (recursive-flag AND catastrophic-target) pair on a
  quote-stripped command, covering `rm -rf -- /`, `rm -rf "$HOME"`, `${HOME}`,
  `.`, `./`, `./*`, `*`, `~`/`~/` — while still allowing `./dist`, `build/*`,
  `~/.cache/x`, `/tmp/x`. Tests added for each.
- **anti-bloat-check** now scans pack skills/hooks too (was core-only), matching
  what ARCHITECTURE.md already claimed ("any SKILL.md / any hooks/*.sh"). This
  immediately caught 8 pack skill descriptions over the 200-char cap; trimmed.
- **Sourcing discipline applies to agents, not just skills.** doctrine-critic
  already carried a `.source`; the four new agents now do too. The CLAUDE.md
  sourcing rule is read as covering any authored doctrine artifact (skill or
  agent), since both are distilled from external sources.
- Refreshed the marketplace manifest (`.claude-plugin/marketplace.json`): the
  `void` plugin now lists the five agents + lifecycle hooks; void-monorepo drops
  the "ADR workflow" line (adr-workflow was promoted to core).

Alternatives rejected:
- A full shell-AST parse for rm safety: too heavy for a <100-line hook. The
  quote-strip + anchored-target regex covers the catastrophic forms deterministically;
  the override env var handles the rare legitimate case.

## 2026-06-04: CLAUDE.md <-> AGENTS.md parity gate made real (was documented fiction)

Context: CLAUDE.md, AGENTS.md, ARCHITECTURE.md and the design plan all cited
`scripts/sync-agent-docs.sh` as a live pre-commit gate enforcing sister-doc
parity. The file did not exist, and there was no git-hook tooling at all
(no husky/lefthook/prepare). The parity claim was unenforced.

Decision: write `scripts/sync-agent-docs.sh` with two modes — `--staged`
(pre-commit XOR: a change touching one sister doc must touch the other) and the
default structure mode (section-heading parity after normalizing the known
terminology variants, stateless so it runs in CI). Wire it via `.githooks/pre-commit`
(opt-in `git config core.hooksPath .githooks`) and a CI step (`pnpm sync:docs`).
Tested in `test/sync-agent-docs/`.

Alternatives rejected:
- A full semantic doctrine-diff: the routing tables legitimately differ in
  content (not just terminology), so a content diff would false-positive.
  Heading parity + the both-or-neither rule is what the headers actually promise.
- Deleting the claim from the docs instead of implementing it: cheaper, but the
  parity rule is worth keeping; make it true rather than drop it.

## 2026-06-04: Codex parity — real doctrine + safety floor, honest about what is pending

Context: the doctrine layer (AGENTS.md) was a real mirror, but the mechanical
layer was Claude-only: `init` never emitted AGENTS.md, and the hooks were Claude
PreToolUse format. A consumer running `init` got a Claude-only harness.

Decision: (1) `init` now patches both CLAUDE.md and AGENTS.md from one runtime-aware
`harnessBlock` (Claude uses `@imports`, Codex lists files to read — Codex has no
`@import`). (2) `protect-sensitive-files` is runtime-aware: it reads
`.tool_input.file_path` (Claude) and scans `apply_patch` envelope headers (Codex),
unit-tested. (3) Ship `packages/core/codex/hooks.json` + `docs/CODEX.md` documenting
the opt-in Codex wiring; `block-dangerous-bash` matches Codex's `shell` tool 1:1.

Honest status logged in docs/CODEX.md: verified = sync gate, AGENTS.md emission,
hook payload parsing. Pending a real-Codex run = end-to-end `.codex/hooks.json`
firing, and a `RUNTIME=codex` (`codex exec`) backend for autonomous-backlog-loop.

Alternatives rejected:
- Auto-write `.codex/hooks.json` + copy hook scripts into every consumer now:
  duplicates the marketplace delivery model and the firing path is unverified
  without a real Codex run. Ship the template + doc; wire deliberately.

## 2026-06-04: lifecycle hooks beyond PreToolUse + plugin slash commands

Context: the plugin wired only PreToolUse hooks and shipped zero slash commands,
leaving the rest of the lifecycle (and in-session ergonomics) unused.

Decision: add `auto-format` (PostToolUse, non-blocking Biome format — repairs
instead of refusing, fails open if Biome absent), `precompact-doctrine`
(PreCompact — re-injects the non-negotiable floor before context loss),
`sessionstart-context` (SessionStart — per-session floor reminder + version), and
`skill-usage-meter` (PreToolUse on Skill — appends to `.void/usage.log` so the
outbound `audit` has real data). Ship `/void-feedback`, `/void-doctor`,
`/void-audit` slash commands so the self-evolution loop is invocable in-session.

Alternatives rejected:
- A UserPromptSubmit hook: overlaps skill auto-discovery and risks noise.
- Making auto-format blocking: formatting must never block a turn; PostToolUse
  non-blocking is the right shape.

## 2026-06-04: claude-md-authoring skill, four scoped agents, no-ai-design-slop, doctrine edits

Context: a deeper pass over the best-practice corpus surfaced gaps not covered by
the existing skills/agents.

Decision: add the `claude-md-authoring` skill (the harness produces CLAUDE.md
files; this governs writing them: length budget, no style rules -> linters,
`file:line` over snippets, progressive disclosure). Add four read-only,
model-tiered, narrow-scope agents — `silent-failure-hunter` (sonnet),
`type-design-analyzer` (opus), `code-explorer` (sonnet), `migration-planner`
(opus) — each routing out of scope, none overlapping doctrine-critic or gstack.
Add the `no-ai-design-slop` PreToolUse hook (deterministic regex for AI visual
tells; static gate, complements frontend-design without touching /design-review).
Distil doctrine into existing skills: vertical-slice planning (writing-plans),
frequent-intentional-compaction + leverage hierarchy (context-management,
code-review), and the agent model-tier convention (ARCHITECTURE.md).

Alternatives rejected:
- Stack-specific reviewer agents (per ECC/wshobson): those are pack concerns, not
  core; rejected to hold the anti-bloat line.
- Cryptographic review-surface receipts (wshobson governance): over-engineered;
  the HITL gate is the load-bearing part, not signed receipts.

## 2026-06-04: opt-in autonomous-backlog-loop (Ralph distilled, HITL at the boundaries)

Context: the harness wanted a way to drain a curated Linear backlog unattended,
with full craftsman discipline, without adopting the unsupervised Ralph loop
(`while :; do cat PROMPT | claude --dangerously-skip-permissions; done`) which is
the antithesis of the harness's HITL-absolute principle.

Decision: ship `autonomous-backlog-loop` as an explicitly-launched skill (core,
never a default). One FRESH `claude -p` process per ticket (true context reset),
state in Linear + on-disk plan files. The human gates move to the boundaries —
backlog curation (acceptance criteria = approved spec) and PR merge — instead of a
per-action prompt. Default `AUTO_MERGE=0` (PRs, human merges). Full-auto
(`--dangerously-skip-permissions`) is gated behind `UNSAFE_FULL_AUTO=1` + a required
`VOID_SANDBOX` marker. The security hooks stay live; the orchestrator refuses to
start with `VOID_HARNESS_ALLOW_*` set or on a dirty tree.

Alternatives rejected:
- Unsupervised Ralph loop as default: no review, no floor, no sandbox. Rejected;
  offered only as an explicit sandboxed opt-in.
- Auto-merge by default: review is where correctness is owned. Default to PRs.
- Self-judged completion: the test suite is the gate, not the model's self-report.
- A `/clear`-only loop (single long session): context rot degrades quality silently;
  a fresh process per ticket is the stronger anti-context-rot.

## 2026-06-04: two security hooks shipped default-on (protect-sensitive-files, block-dangerous-bash)

Context: the harness shipped quality hooks but no safety floor for destructive
actions, and nothing protecting secrets/lockfiles from accidental edits. This is
the prerequisite for any unattended run and a general improvement.

Decision: add `protect-sensitive-files` (PreToolUse Edit|Write — blocks `.env*`
secrets, private keys, credential files, lockfiles, `.git/` internals) and
`block-dangerous-bash` (PreToolUse Bash — blocks recursive root delete, fork bomb,
raw-device writes, force-push without `--force-with-lease`, destructive SQL). Each
has a single deliberate-override env var (`VOID_HARNESS_ALLOW_SECRET_EDIT`,
`VOID_HARNESS_ALLOW_DANGEROUS`) so legitimate cases are unblocked explicitly while
the default is safe. Wired into the core plugin PreToolUse (now 10 hooks).

Alternatives rejected:
- Warning-only (non-blocking): a destructive command warned-but-allowed is not a
  floor. These are irreversible; they block.
- No override: would force users to disable the hook entirely for a one-off
  legitimate edit. A scoped env override is safer than an all-or-nothing toggle.

## 2026-06-04: adr-workflow promoted from pack-monorepo to core

Context: `adr-workflow` lived in pack-monorepo, but ADRs are a universal craftsman
concern and the repo meta-rule already mandates logging non-obvious decisions.

Decision: move the skill to `packages/core/skills/adr-workflow`, generalize the
"monorepo" wording to "codebase", add the missing `.source`, and drop "ADR workflow"
from the pack-monorepo manifest description. Audit note updated (pack → core).

Alternatives rejected:
- Leave it in pack-monorepo: consumers without the monorepo pack would lack a
  universal discipline the meta-rules assume exists.

## 2026-06-04: skill name == folder + naming gate added to anti-bloat-check

Context: the Agent Skills spec requires `name` to equal the parent directory and to
match `^[a-z0-9]+(-[a-z0-9]+)*$`; a mismatch breaks auto-discovery silently. The
harness promised "skill tests pass in CI" but had no structural validation.

Decision: extend `scripts/anti-bloat-check.sh` (the single source of truth, already
run in CI) with a name==folder + naming-convention check across core and pack
skills. Cheap, deterministic, closes the structural half of the CI promise.

Alternatives rejected:
- A separate `skills-ref validate` dependency: adds an external tool for a check
  that is a few lines of shell. Kept it inline in the existing script.

## 2026-06-04: four new core skills + the Rationalizations/Verification section standard

Context: research across anthropics/skills, the Claude Code creators' interviews, and
the best-practice corpus surfaced gaps not yet covered by the 22 core skills.

Decision: add `source-driven-development` (read official docs for the installed
version before writing config; cite the source), `context-management` (the window is
the core constraint: clear, compact, two-correction reset, fresh-context subagents,
state on disk), `compounding` (end-of-cycle ritual: name the reusable pattern and
route it via capture-rule / harness-evolution), and `api-and-interface-design`
(contract-first public interfaces, minimal surface, versioning). New skills adopt a
`## Rationalizations` table (pre-empts the model's excuses to skip the skill) and a
`## Verification` proof-gate as the standard anatomy.

Alternatives rejected:
- Retrofit the Rationalizations/Verification sections into all 22 existing skills
  now: large diff, rewrites authored voice broadly. Set the standard in new skills;
  backfill opportunistically.
- A full `writing-skills`/skill-creator port (to replace the superpowers pointer):
  high value but a larger effort; deferred as a tracked follow-up.

## 2026-06-01: no-null-grep matches on a comment/string-stripped view (heuristic, not AST)

Context: field feedback from a consumer monorepo — `no-null-grep.sh` blocked a
commit because a comment literally said "pas null". The hook matched `\bnull\b`
against the raw line, so the substring `null` inside a `//` comment, a `/* */`
block, or a quoted string was flagged as the `null` literal.

Decision: before matching, strip string literals (`"…"`, `'…'`, single-line
`` `…` ``), inline `/* */` blocks, and `//` line comments per line via sed, then
match `\bnull\b` on the residue. The `// allow-null:` override is checked on the
RAW line first (stripping would erase the tag). Tests in
`test/no-null-grep/no-null-grep.test.ts`.

Alternatives rejected:
- A real AST/TS-aware parse: correct but turns a 56-line shell PreToolUse hook
  into a tsc/tree-sitter dependency, violating "hooks ≤ 100 lines, no framework".
- Comment-stripping only (the minimum the reporter suggested): leaves string
  literals like `"value is null"` flagged. Strings are a legitimate source of the
  same false positive, so they are stripped too.

Known limit (documented in the hook): line-oriented, so a `null` inside a
multi-line block comment or template literal split across the edit chunk may
still be reported. The `// allow-null: <reason>` tag is the escape hatch.

## 2026-06-01: test key/token fixtures are generated at runtime, gitleaks stays as-is

Context: same field feedback. The repo's gitleaks `generic-api-key` rule (NOT a
void-harness hook) flagged a hardcoded base64 `encryptionKey` test fixture and
blocked the commit — gitleaks decodes base64 and scores its entropy.

Decision: do NOT add a `*.test.ts` allowlist to `.gitleaks.toml`. A blanket
path allowlist is a security hole (real leaked secrets in a test file would pass
unscanned). The convention instead: test fixtures for keys/tokens are generated
at runtime (`crypto.randomBytes`) or use low-entropy placeholders — never a
hardcoded high-entropy base64 literal. This keeps the scan at full strength and
removes the false positive at the source.

Scope note: this is a convention for harness-consuming projects, not a code
change in this repo. Logged here because it is a deliberate "don't weaken the
gate" decision with a credible (and rejected) alternative.

## 2026-06-01: one `doctrine-critic` agent, not the three originally planned

Context: the design doc Section 8 and DEV-363 planned three review agents
(`senior-reviewer`, `security-reviewer`, `architect-critic`). An agent-layer
audit (DEV-363, pre-implementation) measured each against what the harness and
the global layer already ship and found heavy responsibility overlap, in tension
with anti-bloat rules 3 (overlap > 30 %) and 6 (no spillover into gstack):

- `senior-reviewer` ≈ global `pr-reviewer` agent + `tdd-guardian` + `ts-enforcer`,
  gstack `/review`, built-in `/code-review` (incl. `ultra`), harness `code-review`
  skill. ~75 % overlap.
- `security-reviewer` ≈ gstack `/cso` (OWASP/STRIDE/secrets/supply-chain, the exact
  scope), built-in `/security-review`, harness `security-guidance` skill (which
  already delegates to `/cso`). ~85 % overlap.
- `architect-critic` ≈ gstack `/plan-eng-review`, harness `hexagonal-architecture` +
  `domain-driven-design` skills + pack `dependency-direction`, and the deterministic
  `boundary-direction-check.sh` hook. ~70 % overlap.

The principle: an agent only earns its place when it adds something a skill or a
hook cannot. The one gap nothing else fills is a **context-isolated, read-only
judgment of conformance to VoidCorp doctrine**. The 8 PreToolUse hooks enforce the
*mechanical* floor (no-any, boundary direction, …) at Edit/Write time; generic
reviewers (`pr-reviewer`, `/review`) check generic quality. Neither judges the
*non-mechanical* doctrine calls — over-abstraction, tests that assert nothing, the
strict-TDD Iron Law and its `.void/config` modes, a boundary respected by the
letter but not the spirit, the seven anti-bloat rules on skills/hooks themselves.

Decision: ship a single `doctrine-critic` agent (read-only, isolated context). It
judges doctrine conformance and **routes** rather than re-implements: it flags
trust-boundary code and hands off to `/cso`, and hands line-level bug hunting to
`/code-review`. Spec: `plans/2026-06-01-doctrine-critic-agent.md`. DEV-363 is
rescoped 3 → 1; the `security-reviewer` and `architect-critic` slots are dropped
(their value already lives in `/cso`, the boundary hook, and the hexagonal/DDD
skills). Manifests move from "3 agents on the roadmap" to "1 shipped".

Naming: "critic", not "reviewer", to avoid routing ambiguity with `pr-reviewer`,
gstack `/review`, and built-in `/code-review` — three review tools already in a
consumer session. "doctrine", not "harness" (which reads as the install itself,
colliding with `doctor`/`audit`) and not "craftsman"/"conformance" (vaguer / more
process-flavoured). It inherits the "critic" of the dropped `architect-critic`.

Alternatives rejected:
- Build all three as planned: triples the maintenance surface and injects
  routing non-determinism (three thin wrappers competing with the global agents
  already present) for near-zero marginal value. Disqualifying for a harness whose
  edge is determinism.
- Ship zero agents (purist anti-bloat): defensible, but leaves the doctrine
  judgment layer uncovered — the hooks catch only the mechanical violations.

## 2026-06-01: keep `workspace:^` for internal deps, guard the packed tarball in CI

Context: `pack-nextjs` peer-depends on `pack-monorepo`. The risk flagged by audit:
`npm pack`/`npm publish` do not understand the workspace protocol, so `workspace:^`
would leak verbatim into a tarball published with npm.

Attempt rejected: switch to an explicit `^<version>` range so the source is
npm-safe. Verified empirically that this BREAKS: `pack-monorepo` is not published
to npm, and pnpm 9 defaults to `link-workspace-packages=false`, so a plain range
resolves against the registry and `pnpm install --frozen-lockfile` fails with
`ERR_PNPM_OUTDATED_LOCKFILE` / unresolved package. The workspace: protocol is
therefore REQUIRED for unpublished internal deps; the earlier "use a literal
range" idea (and a bump-version range-rewriter) was reverted.

Decision: keep `workspace:^` in source. pnpm pack/publish rewrites it to
`^<version>` (verified: the packed tarball carries `^0.5.4`). A CI + release gate
(`scripts/check-publish-safety.mjs`) packs each npm package with pnpm and fails
if a `workspace:` specifier survives into the tarball. This verifies the artifact
we actually ship and catches a conversion regression (bad `.npmrc`, pnpm change).
It does NOT, and cannot, stop a manual `npm publish` that bypasses our tooling:
RELEASING.md mandates `pnpm -r publish`, and that process rule is the boundary of
what an in-repo check can enforce.

## 2026-06-01: .void/config.json pins marketplace plugins, not npm packages

Context: the `packs` field in `.void/config.json` is written by `init` as
`@voidcorp/<plugin-name>` (e.g. `@voidcorp/void-nextjs`) and read back by
`doctor` in the same shape. The docs example instead showed `@voidcorp/pack-nextjs`
(the npm package name), mixing two vocabularies for the same field.

Decision: the field pins marketplace plugins (what `doctor` compares against the
marketplace HEAD), keyed `@voidcorp/<plugin-name>`. Docs were aligned to the
runtime; the schema was left unchanged to avoid breaking existing consumer
configs. The npm package names (`@voidcorp/pack-<stack>`) are a separate concern
(runtime `import`s), documented as such.

Alternative rejected: rekey the field to npm package names. That would require
changing init + doctor in lockstep and would break any `.void/config.json`
already written in consumer projects, for no functional gain (doctor needs the
plugin identity, not the npm name).

## 2026-06-01: em dash / emoji rule softened (no purge, no gate)

Context: the hard rule "No em dashes, no emojis in code/docs/commits" was
contradicted by the corpus itself: 254 tracked files contain em dashes, mostly
deliberate typographic separators in skill prose, and the render layer uses an
em dash glyph as data. CLAUDE.md and AGENTS.md violated their own rule.

Decision: soften the rule to target intent (no AI-slop filler) while allowing
em dashes and emojis where they carry meaning. No repo-wide purge, no CI gate.

Alternatives rejected:
- Purge all 254 files and add a global grep gate: enormous diff, rewrites the
  authored style of every skill, and would still need an allowlist for the
  render glyph. Cost far exceeds the benefit.
- Drop the rule entirely: loses the original intent (keeping AI-slop out of
  newly written prose and commits).

## 2026-06-01: Biome as the linter (over ESLint)

Context: the root `lint` script fanned out to per-package `lint` scripts that
did not exist, so `pnpm lint` printed "None of the selected packages has a lint
script" and exited 0. A quality harness shipped with a gate that gated nothing.

Decision: adopt Biome (`@biomejs/biome`) as the single linter. Root `lint`
script is `biome lint`; config lives in `biome.json`, scoped to first-party
TypeScript (`packages/**/src`, config files, `test/`) and excluding `dist`,
`node_modules`, `templates`, and `*.d.ts`. A CI step runs `pnpm lint`.

Alternatives considered:
- ESLint + typescript-eslint: more rules and plugins, but heavier install,
  slower, and needs a flat-config plus parser wiring. Overkill for a small CLI.
- Keep the fan-out and add per-package ESLint: more moving parts, same result.

Why Biome won: single binary, near-zero config, fast, and the hooks already
treat both `biome` and `eslint.config` as known toolchain markers. The formatter
is left disabled in the gate (`biome lint`, not `biome check`) so the gate
enforces correctness without forcing a repo-wide reformat.

## 2026-06-01: jq is a hard runtime dependency, surfaced by doctor

Context: 15 of the 20 hooks parse the Claude Code tool-call JSON from stdin with
jq. On a machine without jq the hooks fail open and silently stop enforcing.

Decision: `void-harness doctor` now checks for jq alongside gh, with an install
hint. jq stays an external dependency (not bundled): it is ubiquitous and
bundling a binary per platform is not worth the weight.
