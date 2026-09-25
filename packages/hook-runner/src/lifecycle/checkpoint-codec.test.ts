import { describe, expect, it } from 'vitest';
import { PRODUCT_IDENTITY } from '../identity.js';
import { mentionsCheckpointMarker, parseCheckpoint } from './checkpoint-codec.js';

const { current, recognized } = PRODUCT_IDENTITY.markers.contextContinuity;

describe('the checkpoint codec of this product', () => {
  it('reads a checkpoint whose mechanical block carries a former name', () => {
    const former = recognized.at(-1);
    expect(former).toBeDefined();
    if (former === undefined) return;
    const raw = `## Objective\n\nShip it.\n\n${former.begin}\nnot a block\n${former.end}\n`;
    const checkpoint = parseCheckpoint(raw);
    expect(checkpoint.objective).toBe('Ship it.');
    // Found under the former name, then judged: malformed, not absent.
    expect(checkpoint.mechanicalBlockStatus).toBe('invalid');
  });

  it('recognizes every current and former marker in a path', () => {
    for (const pair of recognized) {
      expect(mentionsCheckpointMarker(`src/${pair.begin}.ts`)).toBe(true);
      expect(mentionsCheckpointMarker(`src/${pair.end}.ts`)).toBe(true);
    }
    expect(mentionsCheckpointMarker(`src/${current.begin.slice(0, 8)}.ts`)).toBe(false);
  });
});
