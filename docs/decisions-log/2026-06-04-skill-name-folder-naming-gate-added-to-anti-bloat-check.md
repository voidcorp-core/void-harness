---
date: 2026-06-04
title: "skill name == folder + naming gate added to anti-bloat-check"
---

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
