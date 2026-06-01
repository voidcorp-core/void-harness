# `@voidcorp/harness`

CLI for the [void-harness](https://github.com/voidcorp-core/void-harness): register the marketplace, enable the `void` core plugin plus the stack packs a project needs, and health-check the setup.

## Quick start

```bash
# In any project: register the marketplace, enable core + the packs you pick,
# scaffold .void/config.json, and patch CLAUDE.md / AGENTS.md.
cd my-project
npx @voidcorp/harness init                          # core only
npx @voidcorp/harness init --pack pack-nextjs --pack pack-monorepo

# Verify the setup (offline-friendly)
npx @voidcorp/harness doctor
```

Pack names accept any form: `pack-nextjs`, `void-nextjs`, or `nextjs`.

## Commands

### `init`

Sets up the current project:

- Creates `.void/config.json` (pinned plugin versions, stack, paths, TDD modes)
- Registers the marketplace in `.claude/settings.json` and enables `void` plus the chosen packs
- Patches `CLAUDE.md` / `AGENTS.md` (sister docs, cross-referenced)

```
npx @voidcorp/harness init [--pack <name>...] [--all-packs] [--force]
```

After `init`, restart Claude Code; skills appear as `/void:<name>` and `/void-<pack>:<name>`.

### `add` / `remove`

Enable or disable a pack on an already-initialized project (updates `.claude/settings.json` and `.void/config.json`).

```
npx @voidcorp/harness add pack-nextjs
npx @voidcorp/harness remove pack-nextjs
```

### `doctor`

Health-check: `.void/config.json` validity, marketplace + plugins registered in `.claude/settings.json`, the CLAUDE.md block, `jq` (required by the hooks), and version drift against the marketplace HEAD. `--no-remote` runs fully offline. Exit `0` if all checks pass, `1` otherwise.

```
npx @voidcorp/harness doctor [--no-remote]
```

### `list` / `check` / `update`

`list` shows packs and their detection status; `check` reports version drift; `update` refreshes pinned versions.

### `install --global`

Escape hatch (rare): installs the `void` plugin at the user-global level (`~/.claude-plugin/plugins/void/`) instead of per-project. The recommended flow is `init`.

```
npx @voidcorp/harness install --global [--dry-run]
```

### `help`

Print the command reference.

## License

MIT.
