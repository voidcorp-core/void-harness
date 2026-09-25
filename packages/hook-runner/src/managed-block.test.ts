import { describe, expect, it } from 'vitest';
import { hasManagedBlock, removeManagedBlocks, replaceManagedBlock } from './managed-block.js';

const MARKERS = {
  current: { begin: '<!-- new:begin -->', end: '<!-- new:end -->' },
  recognized: [
    { begin: '<!-- new:begin -->', end: '<!-- new:end -->' },
    { begin: '<!-- old:begin -->', end: '<!-- old:end -->' },
  ],
};
const BLOCK = '<!-- new:begin -->\nfresh\n<!-- new:end -->';

describe('replaceManagedBlock', () => {
  it('replaces a block under the current name where it stands', () => {
    const text = 'head\n<!-- new:begin -->\nstale\n<!-- new:end -->\ntail\n';
    expect(replaceManagedBlock(text, MARKERS, BLOCK)).toBe(`head\n${BLOCK}\ntail\n`);
  });

  it('takes over a block written under a former name, in place, instead of adding a second one', () => {
    const text = 'head\n<!-- old:begin -->\nstale\n<!-- old:end -->\ntail\n';
    expect(replaceManagedBlock(text, MARKERS, BLOCK)).toBe(`head\n${BLOCK}\ntail\n`);
  });

  it('keeps one block when an old and a new one both survived, the first in place', () => {
    const text = 'a\n<!-- old:begin -->\nx\n<!-- old:end -->\nb\n<!-- new:begin -->\ny\n<!-- new:end -->\nc\n';
    const replaced = replaceManagedBlock(text, MARKERS, BLOCK);
    expect(replaced).toBe(`a\n${BLOCK}\nb\n\nc\n`);
  });

  // Blocks nested inside a kept block belong to it: comparing against a span already dropped would
  // let the second nested one survive and resurrect the tail of the outer block after the new one.
  it('treats every block nested inside a kept one as part of it', () => {
    const inner = '<!-- new:begin -->B<!-- new:end -->';
    const text = `<!-- old:begin -->A${inner}C${inner.replace('B', 'D')}E<!-- old:end -->F`;
    expect(replaceManagedBlock(text, MARKERS, BLOCK)).toBe(`${BLOCK}F`);
  });

  it('answers undefined when no recognized block is complete', () => {
    expect(replaceManagedBlock('no block\n', MARKERS, BLOCK)).toBeUndefined();
    expect(replaceManagedBlock('<!-- old:end -->\n<!-- old:begin -->\n', MARKERS, BLOCK)).toBeUndefined();
    expect(replaceManagedBlock('<!-- old:begin -->\n<!-- new:end -->\n', MARKERS, BLOCK)).toBeUndefined();
  });
});

describe('hasManagedBlock', () => {
  it('sees a block under any recognized name', () => {
    expect(hasManagedBlock('<!-- old:begin -->\n<!-- old:end -->', MARKERS)).toBe(true);
    expect(hasManagedBlock(BLOCK, MARKERS)).toBe(true);
    expect(hasManagedBlock('<!-- new:begin -->', MARKERS)).toBe(false);
  });
});

describe('removeManagedBlocks', () => {
  it('cuts every recognized block and reports the holes', () => {
    const text = 'a\n<!-- old:begin -->\nx\n<!-- old:end -->\nb\n<!-- new:begin -->\ny\n<!-- new:end -->\nc';
    expect(removeManagedBlocks(text, MARKERS)).toEqual(['a\n', '\nb\n', '\nc']);
    expect(removeManagedBlocks('plain', MARKERS)).toEqual(['plain']);
  });
});
