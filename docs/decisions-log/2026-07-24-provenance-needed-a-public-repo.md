---
date: 2026-07-24
title: "Provenance was never a pnpm problem: npm rejects attestations from a private repo"
---

## 2026-07-24: Provenance was never a pnpm problem: npm rejects attestations from a private repo

Completes the earlier note the same day, which concluded that provenance "does not
yet" work and guessed at the cause. The guess was wrong and the record should not
keep it.

Once `publishConfig.provenance: true` was declared, the 2.0.2 publish produced the
attestation correctly:

```
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: search.sigstore.dev
npm error 422 Unprocessable Entity - Error verifying sigstore provenance bundle:
  Unsupported GitHub Actions source repository visibility: "private".
  Only public source repositories are supported when publishing with provenance.
```

So the generation side worked all along. **npm refuses a provenance attestation
whose source repository is private**, because the attestation's entire value is
that a third party can follow it back to the commit and workflow that produced the
artifact — which is impossible if nobody can read the repo.

The earlier hypothesis (that `pnpm publish` performed the OIDC exchange itself and
handed npm a token, so npm skipped the automatic attestation) was plausible and
wrong. What actually happened on 2.0.1 is simpler: provenance was never requested,
because the `publishConfig` opt-in did not exist yet.

The repository was made public, the publish was re-dispatched, and
`/-/npm/v1/attestations/voidharness@2.0.2` now returns a sigstore bundle. The
README claims provenance again, with the two commands a reader can run to check
the claim instead of believing it.

**The dependency worth remembering**: provenance is not merely nice-to-have once
you are public — it is *only available* once you are public. For a project whose
pitch is a supply-chain-honest, account-free install, that made opening the
repository a technical prerequisite rather than a marketing decision.
