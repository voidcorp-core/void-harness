---
date: 2026-07-21
title: "void-harness is public MIT, npx-primary — supersedes marketplace-only (2026-07-09)"
---

## 2026-07-21: void-harness is public MIT, npx-primary — supersedes marketplace-only (2026-07-09)

**Supersedes `2026-07-09-distribution-is-marketplace-only-the-cli-is-maintainer-tooli`.** void-harness
is published to npm as `@voidcorp/harness` (MIT, `publishConfig.access: public`) and installed via
`npx @voidcorp/harness init`; a signed standalone binary on GitHub Releases complements npx for
machines without Node. The Claude Code marketplace is demoted to a **secondary, optional** channel for
Claude-Code users who prefer it — no longer the required path.

The 2026-07-09 entry made distribution marketplace-only on the premise that *"consumers need the
plugin, which the marketplace delivers; the CLI they do not need"*. That premise **changed** with the
public multi-runtime redirection (spec `2026-07-21-void-harness-public-multiruntime-os`, Fork 2): the
CLI and `void status` **become the product** — the legible-state surface a developer runs — and the
redirection's non-negotiable is an **account-free** install (no Claude account, no subscription, no
API key to install/audit/visualize). The marketplace cannot satisfy account-free install: it requires
Claude Code. So the earlier decision is not merely revised, its premise no longer holds.

The credible alternative — stay marketplace-only, keep the doctrine private — was rejected (Fork 2
analysis): void-harness is engine + generic craftsman doctrine already ~90% distilled from public
sources (superpowers, TigerStyle, citypaul), and its LICENSE is already MIT. Secrecy of derived prose
buys almost nothing; the moat is the **integration + enforcement + eval-proven evolution**, which
lives in the **private sibling repos** (forge tuning, DECLIK/business packs) and the **telemetry
flywheel**, never in this repo. Publishing the engine is near-pure upside: recognition, adoption, and
the credibility of an open, privacy-first, offline-first harness — which is itself the point.

Telemetry stays opt-in and tiered (see the 2026-07-21 telemetry decision): tier-1 is a maintainer
*pull* of public npm + GitHub stats (zero phone-home); nothing on a user's machine is ever required to
call a VoidCorp service, preserving the offline + no-mandatory-service non-negotiables.

Why: assuming a single, account-free, public channel and making every surface tell that one story is
what makes the "install a top-5% doctrine on any project in under two minutes, free" promise real.
Versions stay release-please-owned; the actual `npm publish` and the signed-binary pipeline are
deliberate release-ops acts, not automated from a working session.
