#!/usr/bin/env bash
# anti-bloat-check — root-level audit of the seven anti-bloat rules
# documented in CLAUDE.md / AGENTS.md.
#
# Run locally: `pnpm anti-bloat:check`
# Also wired into .github/workflows/ci.yml on every PR.
#
# Exit codes: 0 = all checks pass, 1 = at least one rule violated.

set -euo pipefail

FAILED=0

echo "anti-bloat-check"

# Discover skill + hook files across core AND packs (the published surface),
# excluding node_modules, build output, and the cli core-assets mirror.
FIND_EXCL=(-not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/core-assets/*')
SKILL_FILES=$(find packages/core packages/packs -path '*/skills/*/SKILL.md' "${FIND_EXCL[@]}" 2>/dev/null || true)
HOOK_FILES=$(find packages/core packages/packs -path '*/hooks/*.sh' "${FIND_EXCL[@]}" 2>/dev/null || true)

# Rule 1: SKILL.md ≤ 400 LOC (core + packs)
echo "  rule 1: SKILL.md ≤ 400 LOC"
if [[ -n "$SKILL_FILES" ]]; then
  OVERSIZE=$(printf "%s\n" "$SKILL_FILES" | xargs wc -l 2>/dev/null | awk '$1 > 400 && $2 != "total" { print }')
  if [[ -n "$OVERSIZE" ]]; then
    echo "    FAIL: SKILL.md exceeds 400 LOC:" >&2
    echo "$OVERSIZE" >&2
    FAILED=1
  fi
fi

# Rule 5: hooks ≤ 100 LOC (core + packs). Sourced libraries (underscore-prefixed,
# e.g. _hooklib.sh) are NOT hooks — they carry shared code deliberately and are
# excluded from the per-hook cap (still syntax-checked below).
echo "  rule 5: hooks ≤ 100 LOC"
HOOK_FILES_NOLIB=$(printf "%s\n" "$HOOK_FILES" | grep -vE '(^|/)_[^/]*\.sh$' || true)
if [[ -n "$HOOK_FILES_NOLIB" ]]; then
  OVERSIZE_HOOKS=$(printf "%s\n" "$HOOK_FILES_NOLIB" | xargs wc -l 2>/dev/null | awk '$1 > 100 && $2 != "total" { print }')
  if [[ -n "$OVERSIZE_HOOKS" ]]; then
    echo "    FAIL: hook exceeds 100 LOC:" >&2
    echo "$OVERSIZE_HOOKS" >&2
    FAILED=1
  fi
fi

# Manifest <-> disk: every hook command wired in the core plugin manifest must
# resolve to a file on disk. A dangling reference disables enforcement silently
# (the audited fail-open class). Parse the hooks/<name>.sh basenames out of the
# manifest and assert each exists under packages/core/hooks/.
echo "  manifest <-> disk: wired hooks exist"
PLUGIN_MANIFEST="packages/core/.claude-plugin/plugin.json"
if [[ -f "$PLUGIN_MANIFEST" ]] && command -v jq >/dev/null 2>&1; then
  WIRED=$(jq -r '.hooks // {} | to_entries[] | .value[]? | .hooks[]? | .command // empty' "$PLUGIN_MANIFEST" 2>/dev/null \
    | grep -oE 'hooks/[A-Za-z0-9_-]+\.sh' | sort -u || true)
  while IFS= read -r ref; do
    [[ -n "$ref" ]] || continue
    if [[ ! -f "packages/core/$ref" ]]; then
      echo "    FAIL: manifest references packages/core/$ref which does not exist" >&2
      FAILED=1
    fi
  done <<<"$WIRED"
fi

# Hook syntax (core + packs)
echo "  shell syntax: all hooks"
while IFS= read -r f; do
  [[ -n "$f" ]] || continue
  if ! bash -n "$f" 2>/dev/null; then
    echo "    FAIL: syntax in $f" >&2
    FAILED=1
  fi
done <<<"$HOOK_FILES"

# Frontmatter description ≤ 200 chars (rule 4): skills (core + packs) + agents
echo "  rule 4: frontmatter description ≤ 200 chars"
DESC_FILES=$(printf "%s\n" "$SKILL_FILES"; ls packages/core/agents/*.md 2>/dev/null || true)
while IFS= read -r f; do
  [[ -n "$f" && -e "$f" ]] || continue
  DESC=$(awk '/^description:/{ sub(/^description: */,""); print; exit }' "$f" 2>/dev/null || true)
  # Strip a single pair of surrounding quotes: a valid-YAML quoted description
  # (needed when the text carries a colon) must be measured by its value, not its
  # quoting — mirrors read-frontmatter's stripQuotes.
  case "$DESC" in
    \"*\") DESC="${DESC#\"}"; DESC="${DESC%\"}" ;;
    \'*\') DESC="${DESC#\'}"; DESC="${DESC%\'}" ;;
  esac
  LEN=${#DESC}
  if [[ "$LEN" -gt 200 ]]; then
    echo "    FAIL: $f description is $LEN chars (cap 200): $DESC" >&2
    FAILED=1
  fi
done <<<"$DESC_FILES"

# Skill name convention (Anthropic Agent Skills spec): the frontmatter `name`
# must equal the parent directory name and match ^[a-z0-9]+(-[a-z0-9]+)*$
# (lowercase, hyphen-separated, no leading/trailing/double hyphen). A mismatch
# breaks auto-discovery silently, so it is a hard gate.
echo "  skill name == folder + naming convention"
for f in packages/core/skills/*/SKILL.md packages/packs/*/skills/*/SKILL.md; do
  [[ -e "$f" ]] || continue
  DIR=$(basename "$(dirname "$f")")
  NAME=$(awk '/^name:/{ sub(/^name: */,""); print; exit }' "$f" 2>/dev/null || true)
  if [[ -z "$NAME" ]]; then
    echo "    FAIL: $f has no frontmatter 'name:'" >&2
    FAILED=1
    continue
  fi
  if [[ "$NAME" != "$DIR" ]]; then
    echo "    FAIL: $f name '$NAME' != folder '$DIR'" >&2
    FAILED=1
  fi
  if [[ ! "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "    FAIL: $f name '$NAME' violates ^[a-z0-9]+(-[a-z0-9]+)*\$" >&2
    FAILED=1
  fi
  # A skill is named by what someone would type looking for it without knowing
  # it exists. `kind` says which grammar applies, so the rule is checkable
  # instead of being an intention: an action takes its bare verb, a standard
  # takes the subject it governs.
  KIND=$(awk '/^kind:/{ sub(/^kind: */,""); print; exit }' "$f" 2>/dev/null || true)
  case "$KIND" in
    action|standard) ;;
    "") echo "    FAIL: $f has no frontmatter 'kind:' (action or standard)" >&2; FAILED=1 ;;
    *)  echo "    FAIL: $f kind '$KIND' is not action or standard" >&2; FAILED=1 ;;
  esac
  # A gerund names an activity, not a thing to run, so it is refused for an
  # action. It stays legal for a standard, where `testing` is the subject a
  # standard governs rather than a verb dressed as a noun.
  if [[ "$KIND" == "action" && "$NAME" == *ing ]]; then
    echo "    FAIL: $f action '$NAME' is a gerund; name it by its bare verb" >&2
    FAILED=1
  fi
  # Agent-nouns name a person, and a skill is not one. `ticket-runner` announced
  # someone while being a mechanism, which is the confusion this refuses.
  case "$NAME" in
    *-writer|*-runner|*-manager|*-handler|*-helper)
      echo "    FAIL: $f name '$NAME' is an agent-noun; a skill is not a person" >&2
      FAILED=1 ;;
  esac
  # Suffixes that carry no meaning: they lengthen the name without narrowing it.
  case "$NAME" in
    *-workflow|*-management|*-authoring|*-first)
      echo "    FAIL: $f name '$NAME' ends in a filler suffix; the subject alone is the name" >&2
      FAILED=1 ;;
  esac
done

# Sourcing discipline: every skill (core + packs) ships a co-located `.source`
# (provenance that travels with the distributed skill) AND has an audit note in
# docs/plans/skill-audits/ (the repo-side reasoning). Both are required by the
# sourcing rule in CLAUDE.md/AGENTS.md; without a gate the rule rots silently.
echo "  sourcing: .source + audit note per skill"
while IFS= read -r f; do
  [[ -n "$f" && -e "$f" ]] || continue
  DIR=$(dirname "$f")
  NAME=$(basename "$DIR")
  if [[ ! -f "$DIR/.source" ]]; then
    echo "    FAIL: $f has no co-located .source" >&2
    FAILED=1
  fi
  if [[ ! -f "docs/plans/skill-audits/$NAME.md" ]]; then
    echo "    FAIL: skill '$NAME' has no docs/plans/skill-audits/$NAME.md audit note" >&2
    FAILED=1
  fi
done <<<"$SKILL_FILES"

# One slash command, one owner. Claude Code answers `/<name>` from a skill at
# skills/<name>/SKILL.md and from a command at commands/<name>.md alike, so a name
# living in both is listed twice in the palette, each entry carrying its own
# description. The two descriptions drift the moment one side is edited, and the
# person typing the name is asked to pick between them. `/checkpoint` shipped that
# way, advertising two different jobs for one skill.
echo "  slash command name has a single owner"
for root in packages/core packages/packs/*; do
  [[ -d "$root/commands" ]] || continue
  for f in "$root"/commands/*.md; do
    [[ -e "$f" ]] || continue
    NAME=$(basename "$f" .md)
    if [[ -f "$root/skills/$NAME/SKILL.md" ]]; then
      echo "    FAIL: '$NAME' is both $root/commands/$NAME.md and $root/skills/$NAME/SKILL.md" >&2
      FAILED=1
    fi
  done
done

if [[ "$FAILED" -eq 0 ]]; then
  echo "anti-bloat-check: all checks passed."
else
  echo "anti-bloat-check: at least one rule violated." >&2
fi
exit "$FAILED"
