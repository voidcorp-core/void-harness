import { describe, expect, it } from 'vitest';
import { parseDecision } from './parse.js';

describe('parseDecision', () => {
  it('accepts the legacy date/title format without inventing v3 metadata', () => {
    const result = parseDecision(
      `---
date: 2026-06-01
title: "Biome as the linter"
---

## 2026-06-01: Biome as the linter

Decision: use Biome.
`,
      '2026-06-01-biome.md',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'legacy:2026-06-01-biome',
      title: 'Biome as the linter',
      createdAt: '2026-06-01',
      status: 'accepted',
      supersedes: [],
      legacy: true,
    });
  });

  it('parses a v3 decision contract', () => {
    const result = parseDecision(
      `---
schemaVersion: 1
id: "adr:018f43f4-3ac4-7c40-8000-000000000001"
createdAt: "2026-07-24T10:15:00.000Z"
title: "Use one file per ADR"
status: proposed
deciders: [folpe]
supersedes: ["legacy:2026-06-01-old-choice"]
---

# Use one file per ADR
`,
      '2026-07-24-one-file--018f43f4.md',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      schemaVersion: 1,
      id: 'adr:018f43f4-3ac4-7c40-8000-000000000001',
      createdAt: '2026-07-24T10:15:00.000Z',
      title: 'Use one file per ADR',
      status: 'proposed',
      deciders: ['folpe'],
      supersedes: ['legacy:2026-06-01-old-choice'],
      legacy: false,
    });
  });

  it('returns a structured error for malformed frontmatter', () => {
    const result = parseDecision('not frontmatter', 'broken.md');

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: 'invalid-frontmatter',
          file: 'broken.md',
          message: 'expected YAML frontmatter delimited by ---',
        },
      ],
    });
  });

  it('rejects an incomplete v3 contract instead of treating it as legacy', () => {
    const result = parseDecision(
      `---
schemaVersion: 1
title: "Missing identity"
---
`,
      'missing.md',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain('invalid-v3-contract');
  });

  it('rejects a non-UUID v3 identity', () => {
    const result = parseDecision(
      `---
schemaVersion: 1
id: "adr:shared-counter"
createdAt: "2026-07-24T10:15:00.000Z"
title: "Invalid identity"
status: proposed
deciders: [folpe]
supersedes: []
---
`,
      'invalid-id.md',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'invalid-v3-contract' }),
    ]);
  });
});
