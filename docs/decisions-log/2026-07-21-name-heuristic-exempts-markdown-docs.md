---
date: 2026-07-21
title: "the credential-file NAME heuristic exempts markdown docs"
---

## 2026-07-21: the credential-file NAME heuristic exempts markdown docs

Context: migrating the decision log to per-file markdown (same day) created files whose slugs carry
the decision's words — including one ending `-byo-credentials.md`. The server-side floor
(`checks_sensitive_path` in `_checks.sh`, shared by the protect-sensitive-files hook and the CI
`void-enforce` action) flags any basename containing the words `secret`/`credential` as a
"credential file", so that decision note failed the `enforce` gate on PR #106. (The live hook then
also blocked authoring this very note until its slug dropped the trigger word — the false positive,
demonstrated twice.)

Decision: exempt `.md` files from the loose name match. A real credential file is never markdown, and
content-based secret scanning (`checks_secret_content`, gitleaks) still runs on `.md`, so this
removes a false-positive class without weakening protection. The precise rules (`.env`, `.pem`/
`id_rsa`, exact `.npmrc`/`.netrc`/`.pgpass`, lockfiles, `.git/`) are unchanged and never matched
markdown anyway.

Rejected alternative: rename the offending decision slugs to dodge the trigger words. That is a
rustine — it leaves the false positive latent, so any future decision *about* this subject, written
as its own markdown file, would fail `enforce` again. Fixing the heuristic at the root is the
harness's own doctrine (systematic-debugging: fix the cause, not the symptom).
