---
title: Consumer version compatibility
date: 2026-09-10
status: executing
spec: docs/specs/2026-09-10-consumer-version-compatibility.md
author: folpe + Codex
high_risk: true
---

# Consumer version compatibility

## Goal

Apply general guidance independently of consumer versions while retaining the
existing mandatory proof and compiler capability gates.

## Steps

1. **Explicit guidance contract** (strict TDD). Add a version-independent
   technology declaration mutually exclusive with reviewed version bounds.
   Existing bounded profiles retain their behavior. Prove parsing, freshness,
   expiry and mixed workspace behavior before changing shipped profiles.
2. **Consumer mission slice** (strict TDD, depends on 1). Audit all nine core
   profiles; convert general guidance and isolate version-dependent advice by
   its relevant file selectors. Exercise actual shipped profiles through
   load, plan and specialist dispatch with TS 7 and a future/unknown version.
   Keep degraded required guidance and required failed checks blocking.
3. **Release proof** (depends on 2). Regenerate assets, run build/typecheck/test,
   review the integrated diff independently, commit and open the PR to develop.
   Refresh base and wait for every required check before the authorized merge.

## Proof ownership

Profile parser owns declarations; freshness owns expiry/version applicability;
profile selectors own whether advice is relevant to the task; mission context
and controller retain fail-closed required review and verification. The graph
compiler adapter owns API support independently. No new generic probe framework
or optional-proof waiver is introduced.

## Review and execution handoff

User approved the spec and authorized PR/merge after CI. Independent design and
code reviews cover the scope/proof distinction. PR #344 was merged first and is
already in this branch's base. Production promotion and consumer installation
are outside this change.

Resume: steps 1 and 2 implemented and independently reviewed. Step 3 local validation
is complete (4,940 tests passed; 2 existing Semgrep-dependent skips). PR CI and
authorized merge remain. The explicit general/ranged union, scoped configuration profiles,
unavailable-advice reporting and actual dispatch are covered. Existing required
review/proof and compiler guards remain unchanged. The first full filesystem run
caught missing graph relations for the two new profiles; relations were added,
assets regenerated and all 1,566 filesystem tests passed.
