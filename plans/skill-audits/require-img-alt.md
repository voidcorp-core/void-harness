---
skill: require-img-alt
pack: void-react
status: shipped
strategy: native-hook
target_loc: 40
hook_type: PreToolUse (Edit|Write)
audit_date: 2026-06-01
---

# Hook audit: void-react:require-img-alt

**Need.** Every `<img>` without an `alt` attribute is a screen reader silently-broken element. accessibility-check skill mentions it; the hook enforces deterministically.

**Wins.** Cheap grep. Zero false positives in normal code. Surgical override via `// allow-no-alt: <reason>` for legitimate decorative cases.

**Loses to.** `<img>` outside component paths (e.g., emails, MDX content) — intentionally not checked. Dynamic `<img>` constructed via spread props — grep can't catch; relies on accessibility-check skill review.

**Composes with.** `void-react:accessibility-check` (point 2: labels and names — same rule, manual gate). `void:accessibility-first` (parent doctrine).

**Why not in core.** `<img>` is a React/JSX construct. Vanilla HTML, mobile native, etc., have different patterns.
