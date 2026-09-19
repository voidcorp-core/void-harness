# Independent dependency audit for Bun consumers

The optional `packages/core/templates/github/void-dependency-audit.yml` workflow
runs independently of lint, types, tests and build. It has no `needs` edge and does
not run inside a quality job. A registry outage therefore cannot prevent those
checks from running. Both vulnerabilities and unavailable evidence still fail the
audit job; branch protection remains the consuming project's explicit policy.

The companion `dependency-audit.mjs` executes `bun audit --json` once, without a
shell, with a 120-second process timeout and a 1 MiB output bound. The whole job
has a ten-minute limit. It writes `result.json` and `summary.md`, appends the result
to the Actions summary, and uploads the report even when the audit fails.

| State | Exit | Meaning |
| --- | --- | --- |
| `clean` | 0 | Successful, recognized empty registry response |
| `vulnerabilities` | 1 | Recognized advisory records returned |
| `unavailable` | 2 | Process failure, timeout, malformed/ambiguous response or registry error |

An empty stdout, even with exit zero, is unavailable. No retry or
`continue-on-error` turns unavailable evidence into a pass. If setup fails before
the wrapper starts, the job fails and missing reports are explicit; there is no
fabricated clean result. Raw stderr is not copied into artifacts.

## Scope and official contract

This template pins Bun 1.3.14, matching the affected Cortex consumer. It audits the
npm packages Bun submits to its default registry, not the whole supply chain.
In that version, non-npm dependencies and packages assigned to a different scoped
registry are omitted; JSON mode does not list those omissions. A `clean` response
must not be represented as coverage of those dependencies. Projects using these
sources need their own corresponding audit coverage.

The [Bun audit documentation](https://bun.com/docs/pm/cli/audit) explains lockfile
operation and JSON output. The version-specific authority is
[Bun 1.3.14 audit_command.zig](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/cli/audit_command.zig):
exit 1 is shared by findings and registry failures, while an empty response can
exit zero. The wrapper consequently validates the response instead of treating a
process status as a security verdict. The
[official setup-bun action](https://github.com/oven-sh/setup-bun) supports the
explicit `bun-version` input. Action references are pinned to immutable commits.
Changing Bun's version requires checking its response and package-selection
contract again.

## Adoption and distribution

The existing core-assets copier ships both files under
`core-assets/templates/github/`. They are manual templates, not installer-owned
consumer workflows: `init` and `update` do not silently apply them or overwrite
custom CI. A harness release makes the files available; each existing consumer
adopts them through its own reviewed change. New Bun consumers can use the same
pair. This does not change the independent security-baseline template or the
harness release job's npm signature audit.

From a chosen, verified harness checkout or extracted package, copy:

- `templates/github/void-dependency-audit.yml` to `.github/workflows/void-dependency-audit.yml`;
- `templates/github/dependency-audit.mjs` to `.github/scripts/dependency-audit.mjs`.

In a source checkout, the template base is `packages/core`; in the npm package it
is `core-assets`. Keep both copied files versioned together. Adjust the push
branch to the consumer's integration branch if it differs from `main`.

### Cortex migration patch (not applied)

Cortex currently pins Bun 1.3.14 and executes `bun run audit` before lint in its
`quality` job. Its `e2e` job depends on `quality`. Adopt the two files above and
apply this bounded edit to `.github/workflows/ci.yml`:

```diff
       - run: bun install --frozen-lockfile
-      - run: bun run audit
       - run: bun run lint
```

Keep the remaining quality steps and the existing e2e dependency unchanged.
The local package script `audit: bun audit` can remain for interactive use; CI
uses the wrapper for the three-state report. The audit is still non-green on an
outage, but quality and its dependent e2e can finish independently. Inspect the
new audit check and branch-protection requirements before merging the consumer
change. No Cortex file or active installation is modified by this harness change.
