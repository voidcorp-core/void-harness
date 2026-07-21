---
date: 2026-06-01
title: "no-null-grep matches on a comment/string-stripped view (heuristic, not AST)"
---

## 2026-06-01: no-null-grep matches on a comment/string-stripped view (heuristic, not AST)

Context: field feedback from a consumer monorepo — `no-null-grep.sh` blocked a
commit because a comment literally said "pas null". The hook matched `\bnull\b`
against the raw line, so the substring `null` inside a `//` comment, a `/* */`
block, or a quoted string was flagged as the `null` literal.

Decision: before matching, strip string literals (`"…"`, `'…'`, single-line
`` `…` ``), inline `/* */` blocks, and `//` line comments per line via sed, then
match `\bnull\b` on the residue. The `// allow-null:` override is checked on the
RAW line first (stripping would erase the tag). Tests in
`test/no-null-grep/no-null-grep.test.ts`.

Alternatives rejected:
- A real AST/TS-aware parse: correct but turns a 56-line shell PreToolUse hook
  into a tsc/tree-sitter dependency, violating "hooks ≤ 100 lines, no framework".
- Comment-stripping only (the minimum the reporter suggested): leaves string
  literals like `"value is null"` flagged. Strings are a legitimate source of the
  same false positive, so they are stripped too.

Known limit (documented in the hook): line-oriented, so a `null` inside a
multi-line block comment or template literal split across the edit chunk may
still be reported. The `// allow-null: <reason>` tag is the escape hatch.
