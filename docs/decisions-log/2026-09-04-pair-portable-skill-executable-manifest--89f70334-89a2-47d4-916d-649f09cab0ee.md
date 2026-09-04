---
schemaVersion: 1
id: "adr:89f70334-89a2-47d4-916d-649f09cab0ee"
createdAt: "2026-09-04T10:12:45.290Z"
title: "Pair each portable skill with an executable manifest"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Pair each portable skill with an executable manifest

## Context

The Agent Skills specification limits top-level `SKILL.md` frontmatter to six portable fields and
allows only string values inside `metadata`. Void Machine needs a nested executable contract for
capabilities, schemas, permissions, effects, proof requirements and runtime features. Encoding that
contract into the skill would either fail the reference validator or hide JSON inside a string.
This repository already protects portable frontmatter and co-locates `harness.yaml` metadata.

## Decision

Keep `SKILL.md` conformant and pair it with a Machine-owned `harness.yaml` executable manifest in
the signed skill package.

The release index binds the portable skill-directory digest and manifest digest into one package
identity. Void Machine reads the manifest from its exact content package; runtime materializers
receive the portable skill files they support. Installation and certification refuse a missing,
stale or incompatible half of the pair.

## Consequences

Positive:

- Skills remain valid across Claude Code, Codex and other Agent Skills clients.
- The executable manifest retains structured types instead of an encoded metadata string.
- The package digest and validation gate prevent the two sources from drifting silently.

Negative:

- Humans see two files when authoring a Machine-capable skill.
- Build, install and audit tooling must validate and report the pair as one package.

## Alternatives considered

- **Add proprietary top-level frontmatter**: rejected because the official reference validator
  refuses unknown fields and portability is an approved invariant.
- **Encode the manifest as JSON in `metadata`**: rejected because the official field is a string map;
  escaping a nested contract harms readability, diff quality and schema validation.
- **Infer permissions and effects from prose**: rejected because an LLM-readable instruction is not
  an executable authority contract.

## Reversal cost

**Low.** Both files already share a directory in source. A future Agent Skills standard with a
compatible structured extension could be adopted through the release compiler and contract version.
