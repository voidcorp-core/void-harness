import { expectTypeOf, it } from 'vitest';
import type { NormalizedEdit } from './types.js';

it('keeps deletion metadata optional and limited to explicit whole-file deletion', () => {
  expectTypeOf<NormalizedEdit>().toEqualTypeOf<{
    readonly path: string;
    readonly addedContent: string;
    readonly operation?: 'delete';
  }>();
});
