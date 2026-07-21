---
date: 2026-06-29
title: "harness-graph joins the version lockstep"
---

## 2026-06-29: harness-graph joins the version lockstep

Context: the `@voidcorp/harness-graph` kernel (merged in #41) shipped with a real
version (0.12.1) but was wired into neither the release-please `extra-files` nor
`scripts/check-version-lockstep.mjs` (`NPM_PACKAGES`). It would have stayed at
0.12.1 while everything else bumped to 0.13.0 -- a silent drift, uncaught because
it was also excluded from the drift check.

Decision: add `packages/harness-graph/package.json` to BOTH the release-please
extra-files and `version:check`, so the kernel bumps in lockstep with the rest.
This matches the CLAUDE.md doctrine ("release-please bumps every manifest in
lockstep") and the kernel already sat at the lockstep version. Alternative
rejected: version the kernel independently (own publish cadence, like the
deliberately-excluded `apps/graph-studio`). Rejected because nothing indicated an
independent cadence -- the omission was forgotten wiring at #41, not a policy.
