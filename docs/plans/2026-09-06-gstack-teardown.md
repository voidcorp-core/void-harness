# DEV-395 GStack teardown

Status: migration, repository cleanup, and exact user-level runtime removal
executed on 2026-09-06; rollback archive retained until 2026-10-06.

This record is the rollback and evidence boundary for the physical GStack
teardown. The repository had no live GStack capability dependency; the
remaining work removed the user-level runtime and migrated the only project
knowledge records that still lived there.

## Preserved

- iOS skills and helpers remain available outside the removed runtime, as
  required by ADR-0001. A dated snapshot is also retained.
- No standalone `~/.gbrain` installation existed before the teardown. The four
  GBrain-facing skills and their helper scripts were copied into
  `~/.gbrain/skills` and `~/.gbrain/bin` so the ADR-0002 boundary remains
  external and does not keep a GStack discovery path under `~/.claude/skills`.
- The source archive remains at
  `~/gstack-snapshots/2026-09-06-dev395/gstack-global.tgz`.

## Migrated

- `~/.gstack/projects/declik/{learnings,decisions}.jsonl` was translated into
  DECLIK's `.void/PROJECT-DOCTRINE.md` and `decisions/` records.
- The `declik-ai-declik` learnings file was mapped to the actual
  `~/Developer/declik` checkout because no separate repository exists at that
  name. The mapping is recorded in the migrated decision metadata.
- No raw session, authentication, token, or browser-profile file was copied
  into the project or into the GBrain bundle.

## Removed

- The GStack skill tree, dropped duplicate skill directories under
  `~/.claude/skills`, the browse runtime state, and `~/.gstack` were removed
  from the user environment after the explicit destructive-operation gate.
- Active GStack instructions in global Claude configuration, the DECLIK
  project instructions, and Claude project memory. Historical provenance in
  the coverage matrix, decision log, and source notes remains intact.

## Verification and rollback

Verification checks that must remain true:

```text
find ~/.claude/skills -maxdepth 1 -iname '*gstack*' -o -iname 'browse' -o -iname 'ship'
rg -n -i 'gstack|/ship|/browse' ~/.claude/CLAUDE.md ~/Developer/declik/CLAUDE.md
test ! -e ~/.gstack
test -d ~/.gbrain/skills/setup-gbrain
```

The archive SHA-256 is recorded in `SHA256SUMS` beside this snapshot. To roll
back, stop Claude, extract the archive into a temporary directory, restore only
the paths named by the archived manifest, and remove the migrated external
bundle. Do not overwrite project files without first preserving their current
contents.

The archive is retained for 30 days, until 2026-10-06, then may be removed by
an explicit human action after a fresh-session verification.
