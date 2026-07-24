---
date: 2026-07-24
title: "Tokenless publishing works; provenance does not yet, and the README says so"
---

## 2026-07-24: Tokenless publishing works; provenance does not yet, and the README says so

With the `registry-url` bug fixed, 2.0.1 published from CI with **no token anywhere** —
trusted publishing via OIDC works. But the attestation endpoint
(`/-/npm/v1/attestations/voidharness@2.0.1`) returns 404: **no provenance was
attached**, despite the publish step being named "provenance auto" and
`docs/RELEASING.md` promising provenance-signed releases.

npm attaches provenance automatically for a trusted-publishing flow on npm >=
11.5.1, and the runner has npm 11.x. The likely reason it did not fire: the
publish goes through `pnpm publish`, so pnpm performs the OIDC exchange itself and
hands npm a short-lived token. npm then sees an ordinary token publish, not a
trusted-publishing one, and skips the automatic attestation.

Two things follow.

**The mechanism is now declared explicitly.** `publishConfig.provenance: true` in
`packages/cli/package.json`, which is npm's documented opt-in and travels with the
package rather than living in a workflow step. Whether pnpm honours it end to end
is unverified — proving it requires cutting a release, and a version should not be
burned on an experiment. The next release settles it.

**The README stops claiming it.** It previously advertised provenance-signed
releases; two published versions carry no attestation. The claim is replaced with
what is actually verified — tokenless OIDC publishing, no npm token in the repo —
plus an explicit "do not rely on a provenance attestation". It will claim
provenance again once one is observed on a real release.

This is the same discipline applied to the status score: report what is observed,
not what was intended. A supply-chain guarantee is the last place to round up.
