import { describe, expect, it } from 'vitest';
import identity from '../../../../packages/core/data/identity.json' with { type: 'json' };
import { sourceUrl } from './panel.js';

describe('source link', () => {
  // The link is built from the product identity, so a rename moves it with
  // every other reference instead of leaving it on a redirect.
  it('points at the file in the repository the identity names', () => {
    expect(sourceUrl('packages/core/skills/void-tdd/SKILL.md')).toBe(
      `https://github.com/${identity.repository.owner}/${identity.repository.name}/blob/main/packages/core/skills/void-tdd/SKILL.md`,
    );
  });
});
