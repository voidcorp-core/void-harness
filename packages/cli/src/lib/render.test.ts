import { afterEach, describe, expect, it, vi } from 'vitest';
import { banner } from './render.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function printed(run: () => void): string {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  });
  run();
  return chunks.join('');
}

describe('banner', () => {
  // Every command opens with this line; it names the command a person types, never a former one.
  it('signs every command with the current product command', () => {
    const out = printed(() => banner('doctor', '4.0.0'));
    expect(out).toContain('void-machine');
    expect(out).toContain('doctor');
    expect(out).not.toMatch(/void-harness/);
  });
});
