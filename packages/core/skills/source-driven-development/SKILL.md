---
name: source-driven-development
activation: always
description: Ground every third-party config or API usage in the official docs for the installed version, not training memory. Verify the version, cite the reference. Use before writing any tool config.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# source-driven-development

Training memory drifts. It blends three minor versions of a framework into one plausible-looking config that compiles, runs, and is subtly wrong: a renamed option, a removed flag, a default that flipped between majors. This skill makes the official documentation of the **installed version** the source of truth for any third-party tool, and makes the reference survive in the commit so the "why" outlives the session.

This encodes the repo hard rule: *read the official documentation of any third-party tool before writing its config.*

**Attribution**: see `.source` in this directory.

---

## The rule

When you configure or call a third-party tool (framework, library, CLI, API, build tool):

1. **Find the installed version.** Read the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `Cargo.lock`) or the resolved entry, not just the `^x` range in `package.json`. Options change between majors; the range lies about what is actually resolved.
2. **Read the docs for that version.** Pin the docs to the resolved major/minor. Latest-docs for an older installed version is a silent mismatch.
3. **Prefer a clean read.** Use the `defuddle` skill (or WebFetch) on the official docs. Strip nav and ads to the load-bearing prose. Distrust third-party tutorials, blog posts, and Stack Overflow answers: they are dated by construction and rarely say which version they target.
4. **Cite the reference.** Put the URL + section (or doc path) in the commit body, the PR, or a comment next to non-obvious config. The next reader must be able to re-derive the choice.

Memory proposes; docs dispose.

---

## Conflict resolution

| Conflict | Winner | Why |
|---|---|---|
| Memory vs official docs | Docs | Memory is a lossy average of many versions; docs describe one. |
| Two sources disagree | Official + version-matched | Vendor docs for the installed version beat any third party. |
| Docs vs a stale tutorial | Docs | Tutorials freeze a moment; the tool moved on. |
| Latest docs vs installed-version docs | Installed-version docs | You ship what is installed, not what is newest. |

When the docs and a working example genuinely conflict and you cannot resolve it, that uncertainty is a finding: surface it, do not paper over it with a guess.

---

## What "cite the reference" looks like

In a commit (composes with `commit-discipline` — the "why" carries the source):

```
chore(build): set vite `build.target` to es2022

Vite 7 dropped the old `esbuild.target` shorthand; the documented field
is now build.target. Ref: vitejs.dev/config/build-options#build-target
(v7 docs, matches pnpm-lock resolved 7.0.x).
```

Next to non-obvious config:

```ts
// retries default changed to 0 in playwright 1.45; opt back in explicitly.
// ref: playwright.dev/docs/test-retries (v1.45 docs)
retries: 2,
```

A config line a reviewer cannot trace to a source is a config line written from memory. Treat that as unverified.

---

## When this applies

- Writing or changing any tool config (bundler, test runner, linter, ORM, CI, framework).
- Calling a third-party API or SDK where parameter names, defaults, or auth flow matter.
- Choosing options that differ across major versions.
- Upgrading a dependency across a major (re-read; do not assume the old config carries).

## When this does NOT apply

- First-party code in this repo (you own it; read the source, not "docs").
- Stable, well-internalized language built-ins where no version ambiguity exists.
- Throwaway exploration you will delete (but the moment it lands, the rule applies).

---

## Offline / no-network

Some runs have no egress: a sandboxed autonomous worker, an air-gapped CI step. You still must not write config from memory. Two moves keep the rule intact without opening the network:

1. **Inject the doc, do not fetch it.** Treat the version-matched reference as an *input*, not a side effect: pass the doc text (or a curated, version-pinned excerpt committed to the repo) into the decision as a parameter — a port — and validate its shape at the boundary with Zod before you trust it (e.g. assert the option you are about to set actually appears in the supplied reference). This is functional core / imperative shell: fetching is an adapter concern, the choice logic takes the doc as data. It composes with `hexagonal-architecture` and `security-guidance` (untrusted input is validated at the edge).

2. **If no version-matched doc is reachable, incur a `source-debt`.** A `source-debt` is a deliberate, tracked IOU: "this config was authored offline, without the version-matched source; a human must verify it against the real docs before it ships." It is the honest alternative to guessing silently. Record all three:
   - a **`source-debt` label** on the PR (and the Linear ticket),
   - a **mandatory PR-body checkbox**: `- [ ] source-debt: <tool@version + option> verified against the version-matched official docs`, which a reviewer clears only by doing the read,
   - a **commit-body note** naming exactly what is unverified.

**Do not auto-merge while a `source-debt` checkbox is unchecked.** The offline bypass is for *authoring* without egress, never for *shipping* unverified config. The autonomous loop enforces this: it refuses to arm auto-merge when the PR body carries an open `source-debt`.

This widens egress by **zero** (decision A3): offline work defers the verification behind an explicit, reviewable IOU; it never reaches for the network it was denied.

---

## Composition

- **Upstream of `writing-plans`** — stack decisions in a plan must be grounded in current official docs, not remembered defaults. A plan step that pins a library cites the doc that justifies the choice.
- **With `commit-discipline`** — the mandatory "why" in the commit body is where the source citation lives. The git log becomes the audit trail of *why this config*, traceable to a versioned doc.
- **With `adr-workflow`** (pack-monorepo) — a structural tool choice becomes an ADR whose "Alternatives considered" cites the official docs of each option, not folklore.
- **Contrast with memory-driven work** — the failure mode this skill replaces is writing config from training recall and only checking docs when it breaks. Invert that order.

---

## Rationalizations

| Rationalization | Reality |
|---|---|
| "I know this API, I've used it many times" | You know an average of several versions. The installed one has its own truths. |
| "The docs will just say what I already think" | Then the read costs seconds and confirms it. When they don't, you just dodged a bug. |
| "It compiled / it ran, so it's right" | Wrong defaults compile fine. Deprecated-but-still-working options run fine. Until they don't. |
| "This tutorial does exactly this" | Tutorials rarely state their version and rot silently. Match the vendor docs to your lockfile. |
| "Checking the version is overkill for a config tweak" | The tweak that broke prod was a flag renamed between minors. The check is cheap. |
| "I'll add the source citation later" | Later never comes; the "why" is lost the moment the session ends. Cite in the same commit. |
| "Latest docs are close enough" | "Close enough" between majors is how a removed option ships to prod. |

---

## Verification

The work is not done until the source check is done. Before marking any third-party config or usage complete:

- [ ] Installed version identified from the lockfile (not the `package.json` range).
- [ ] Official docs for **that** version read (via `/defuddle` / WebFetch, not memory or a tutorial).
- [ ] Every non-obvious option traceable to a doc URL + section.
- [ ] Source cited in the commit body, PR, or an adjacent comment.
- [ ] Any memory-vs-docs conflict resolved in favor of the docs, or surfaced as an open question if irresolvable.

If any box is unchecked, the config is written from memory. That is the state this skill exists to prevent.

---

## Anti-rules

- MUST NOT write tool config from training memory alone — read the version-matched docs first.
- MUST NOT skip the installed-version check — the `^` range is not the resolved version.
- MUST NOT cite a third-party tutorial as authoritative — the official, versioned doc is the source.
- MUST NOT land non-obvious config without a traceable source citation.
- MUST NOT silently pick a side when sources genuinely conflict — surface the divergence.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Cannot find the official docs | Start from the package homepage / repo README, follow to the versioned docs site. Avoid SEO tutorials. |
| Docs only cover "latest" | Check the changelog / migration guide for your installed major; or read the versioned docs branch / tag. |
| Docs and a working snippet conflict | Trust the versioned official docs. If still unresolved, surface it as an open question, do not guess. |
| The option I remember doesn't exist | It was renamed or removed. Read the migration guide for your major. |
| No time to read everything | Read the one section governing the option you are setting. Targeted, not exhaustive. |

---

## Final rule

```
Third-party config → installed version found, version-matched official docs read, source cited.
Otherwise → it was written from memory, and memory is not a source.
```
