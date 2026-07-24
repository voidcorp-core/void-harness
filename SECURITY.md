# Security policy

## Reporting a vulnerability

Report privately through GitHub's **[Security Advisories](https://github.com/voidcorp-core/void-harness/security/advisories/new)**, not a public issue.

Expect an acknowledgement within 72 hours. If a fix is warranted you will be credited in the advisory unless you ask otherwise.

## What is in scope

void-harness writes files into a project and installs hooks that a coding agent executes. That makes a few things security-relevant in a way they would not be for an ordinary CLI:

- **Hook execution.** Hooks staged into `.void/hooks/` run as shell on the developer's machine on every tool call. A path that lets attacker-controlled content reach a hook's execution, rather than only its input, is in scope.
- **Enforcement bypass.** The guardrails (`block-dangerous-bash`, `protect-sensitive-files`, `secret-in-content`) are a **best-effort tripwire, not a sandbox** — this is stated in each hook's header. A novel destructive-shell form they miss is a gap worth reporting, but it is not a vulnerability by itself. What *is* in scope: a payload shape that makes a hook fail **open** when it should block, since that turns a visible guardrail into a silent one.
- **Install-time writes.** `init` is transactional: it preflights before writing and rolls back on failure. A path that makes it write outside the project root, or clobber a file it did not create, is in scope.
- **Supply chain.** The published package, its provenance attestation, and the release workflow. Releases are published from CI via OIDC with no npm token in the repo or its secrets.

## What is not in scope

- The guardrails missing an exotic destructive command. They are a blocklist by design; the real boundary for unattended runs is the deny-by-default permission scope plus a sandbox (see `docs/CODEX.md`).
- Anything requiring an attacker to already have local code execution or write access to the repository.
- Findings against the doctrine content itself (a skill recommending a practice you disagree with is a discussion, not a vulnerability).

## Supported versions

The latest published minor receives fixes. Given the project's age, older lines are not backported.
