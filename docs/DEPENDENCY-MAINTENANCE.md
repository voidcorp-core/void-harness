# Dependency maintenance

Lockfiles are generated artifacts, not secrets. Never hand-edit them. For a
requested dependency change, use the project's package manager to regenerate the
lockfile and commit the result, even if the manifest does not change.

Bun uses `bun.lock` (text since Bun 1.2); older projects may use `bun.lockb`.
Both are protected from direct edits. See the official
[Bun lockfile documentation](https://bun.sh/docs/pm/lockfile) and
[update command](https://bun.sh/docs/pm/cli/update).

Review the resolved dependency diff, run the project's frozen installation
(for Bun, `bun install --frozen-lockfile`), vulnerability audit and tests.
Use the installed package-manager version and the project's existing CI commands.
A frozen installation checks manifest/lockfile consistency; it does not establish
that the packages are safe or prove how the lockfile was produced.

The harness CI floor accepts lockfile diffs without requiring a manifest change,
emits a validation reminder, and still scans textual added lines for secrets.
Binary lockfile contents cannot be certified by this text-diff scanner.
The consumer's dependency jobs and human review remain required; this scanner
neither runs nor certifies them. Do not add a dummy manifest edit or allowlist the
lockfile to pass CI. Secret and key protections remain independent.
