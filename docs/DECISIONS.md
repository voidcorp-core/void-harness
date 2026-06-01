# Decisions log

Non-obvious decisions taken on the harness itself, where a credible alternative
existed. One entry per decision. Newest first. See CLAUDE.md meta-rules.

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
