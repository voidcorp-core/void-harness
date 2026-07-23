---
date: 2026-07-23
title: "node engines floor is >=22.12; CI and dev stay on Node 24"
---

## 2026-07-23: node engines floor is >=22.12; CI and dev stay on Node 24

The published `engines.node` is `>=22.12`, while CI (`ci.yml`, `release.yml`) and
the recommended maintainer environment stay on **Node 24**.

Earlier (2026-07-22) the floor was raised to `>=24` on the reasoning "CI is on 24,
standardize". The second external audit (2026-07-23) flagged this as needless
adoption friction, and it was reconsidered: the CLI uses no Node-24-only feature,
so `>=24` is a *declared* constraint, not a technical one. With no `engine-strict`
in a consumer's `.npmrc`, a Node 22 (LTS, supported to 2027) user gets a warning
but the install still works; with `engine-strict` it hard-fails — pure friction
for a tool meant to be viral and account-free.

Resolution (maintainer call): **accept Node 22+ (`>=22.12`, the Vite 8 floor) while
keeping the codebase and CI on 24** — modern by default, welcoming to those still
on 22. Reversible in one line. Supersedes the `>=24` bump on the engines floor
only; CI's Node version is unchanged.
