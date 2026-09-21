import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { sendSignal } from './fixtures/signal-client.js';
import { processSignals } from './process-signal.js';

// A named Unix socket is limited to 104 bytes on macOS and 108 on Linux.
const UNIX_SOCKET_PATH_BYTES_MAX = 108;

it('receives a signal from a directory whose path exceeds any Unix socket limit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'machine-signal-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'd'.repeat(100), 'e'.repeat(100));
  mkdirSync(directory, { recursive: true });
  expect(Buffer.byteLength(directory)).toBeGreaterThan(UNIX_SOCKET_PATH_BYTES_MAX);
  const signals = await processSignals(directory);
  await sendSignal(directory, 'held');
  await signals.received('held');
});
