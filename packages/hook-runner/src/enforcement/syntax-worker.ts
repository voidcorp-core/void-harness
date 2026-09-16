// tdd-cover: e2e packages/hook-runner/src/enforcement/syntax-worker.test.ts
import { readSync } from 'node:fs';
import { syntaxInput, type SyntaxResult } from './syntax-contract.js';

async function inspect(): Promise<SyntaxResult> {
  // JSON escaping can expand each source byte sixfold; the decoded source has
  // its own 64 KiB limit. Read a bounded buffer even for a malformed caller.
  const bytes = Buffer.alloc(6 * 65_536 + 32_768);
  let length = 0;
  try {
    while (length < bytes.length) {
      const read = readSync(0, bytes, { offset: length, length: bytes.length - length });
      if (read === 0) break;
      length += read;
    }
    if (length === bytes.length) return { version: 1, kind: 'invalid-request' };
    const input = syntaxInput(JSON.parse(bytes.toString('utf8', 0, length)));
    if (input === undefined || Buffer.byteLength(input.source) > 65_536) return { version: 1, kind: 'invalid-request' };
    try {
      // Reject malformed envelopes before initializing the official compiler.
      const { analyzeSyntax } = await import('./syntax-analysis.js');
      return { version: 1, kind: 'inspected', ...analyzeSyntax(input) };
    } catch (error) {
      return { version: 1, kind: error instanceof SyntaxError ? 'invalid-source'
        : error instanceof RangeError ? 'limit' : 'unavailable' };
    }
  } catch {
    return { version: 1, kind: 'invalid-request' };
  }
}

void inspect().then((result) => { process.stdout.write(JSON.stringify(result)); });
