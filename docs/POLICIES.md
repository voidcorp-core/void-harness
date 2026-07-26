# Mission policies

`void-harness mission plan` compiles a ticket, the current diff, the detected stack, and layered
policy into one deterministic mission DAG before any specialist runs. Planning is local, offline,
and LLM-free.

## Precedence and locations

Policy is merged in one fixed order:

```text
core < profile < organization < project
```

| Layer | Location | Files loaded |
|---|---|---|
| core | bundled `policies/core.yaml` | certified artifact |
| profile | `.void/profiles/` | `*.policy.yaml` or `*.policy.yml` |
| organization | `.void/organization/` | `*.policy.yaml` or `*.policy.yml` |
| project | `.void/policies/` | `*.yaml` or `*.yml` |

Profile policies use the explicit `.policy.yaml` suffix so future stack profile documents can live
beside them without being interpreted as policy. Files are sorted, root-confined, limited to 64
KiB each, and parsed as strict YAML 1.2 with duplicate keys and aliases rejected.

## Contract

Every document is versioned and every rule targets one known mission pass:

```yaml
schemaVersion: 1
id: project:quality-floor
version: 1
layer: project
rules:
  - id: core:security
    pass: security
    strength: blocking
    baseline: true
    appliesWhen:
      any: [security]
```

`strength` is `advisory`, `required`, or `blocking`. A higher layer may add rules, broaden
applicability, enable a baseline, or raise strength. It cannot change a rule's pass or weaken a
lower layer silently.

A necessary weakening requires an organization or project waiver:

```yaml
waivers:
  - id: waiver:legacy-security-adapter
    ruleId: core:security
    reason: Compatibility window while the legacy adapter is removed.
    approvedBy: security-owner
    approvedAt: 2026-07-25T00:00:00Z
    expiresAt: 2026-08-01T00:00:00Z
```

Expired, malformed, or unrelated waivers do not apply. Used waivers remain visible in the compiled
plan. Unresolved conflicts fail planning closed.

## Plan a ticket

```bash
void-harness mission plan --ticket tickets/DEV-435.md --json
```

The command reads a Markdown ticket inside the project root, inspects tracked and untracked diff
paths with direct `git` argv, detects the stack, then emits risk, applicability proofs, and the DAG.
Every quality-floor pass receives `pending`, `not-applicable`, or `unknown`. Missing repository
context produces `degraded` context and `unknown` decisions, never a fabricated green.

The output is deterministic for identical inputs. `generatedAt` is the only observation-time field
and is excluded from `planHash`.

## Failures and rollback

- Usage errors return exit code 2 with `MISSION_USAGE`, the problem, and a correction.
- Invalid YAML, path escape, oversized files, duplicate IDs, and policy conflicts return exit code
  1 through `MISSION_FAILED` with the underlying cause.
- Remove or correct the offending higher-layer file to fall back to the certified core policy.
- Rolling back the CLI restores the previous schema reader; policy schema v1 files remain plain
  local YAML and can be removed without changing project code.
