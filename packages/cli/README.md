# `@voidcorp/harness`

CLI for the [void-harness](https://github.com/voidcorp-core/void-harness) — install core skills/agents/hooks into `~/.claude/voidcorp/`, initialize a consumer project, doctor health-check.

## Quick start

```bash
# Install the harness core globally (once per machine)
npx @voidcorp/harness install

# In any consumer project
cd my-project
npx @voidcorp/harness init                       # base setup
npx @voidcorp/harness init --pack pack-nextjs-pwa   # base + pack

# Verify
npx @voidcorp/harness doctor
```

## Commands

### `install`

Installs the harness core into `~/.claude/voidcorp/`. Idempotent. Detects an existing install and updates.

```
npx @voidcorp/harness install [--dry-run]
```

### `init`

Initializes the current project:

- Creates `.voidcorp/config.json` with sensible defaults
- Creates `CLAUDE.md` and `AGENTS.md` (sister docs, cross-referenced)
- (Phase A+) Wires the pre-commit sync hook

```
npx @voidcorp/harness init [--pack <name>...] [--force]
```

### `doctor`

Health-check:

- `~/.claude/voidcorp/` install integrity
- `.voidcorp/config.json` validity
- Sister-doc parity (CLAUDE.md + AGENTS.md cross-reference)
- Hooks executable

Exit `0` if all checks pass, `1` otherwise.

```
npx @voidcorp/harness doctor
```

### `help`

Print the command reference.

## Phase A scope

This CLI is the Phase A deliverable. Phase B adds `add` (per-pack installation), `update` (semantic update with changeset awareness), and `feedback push` (inbound harness-evolution loop).

## License

MIT.
