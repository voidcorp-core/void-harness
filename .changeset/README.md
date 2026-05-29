# Changesets

This directory holds changeset files used to version and publish `@voidcorp/*` packages.

When you make a code change that affects users:

```bash
pnpm changeset
```

Pick the package(s) affected, the bump type (`patch` / `minor` / `major`), and write a one-line "why". The changeset is committed alongside the code. Release runs combine changesets into a single version + changelog at release time.

See [changesets docs](https://github.com/changesets/changesets) for full reference.
