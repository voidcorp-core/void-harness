import { writeFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';
import { SIGNAL_PORT_FILE } from './fixtures/signal-client.js';

/**
 * Receives the named lines fixture processes send when they reach a barrier, so a test
 * waits on the event itself instead of polling a file under an assertion deadline. The
 * test bound stays the only bound on a signal that never comes.
 *
 * The channel is a loopback TCP port published in `directory`, not a named Unix socket:
 * a socket path is limited to about 104 bytes and test directories are not.
 */
export async function processSignals(directory: string) {
  const arrived = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  const sockets = new Set<Socket>();
  const deliver = (name: string): void => {
    arrived.add(name);
    for (const resolve of waiting.get(name) ?? []) resolve();
    waiting.delete(name);
  };
  const server = createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) deliver(line);
    });
    socket.once('close', () => { sockets.delete(socket); });
  });
  onTestFinished(() => new Promise<void>((resolve) => {
    for (const socket of sockets) socket.destroy();
    server.close(() => { resolve(); });
  }));
  // The address is read only once the server reports it is listening, as Node documents.
  await new Promise<void>((listening, failed) => {
    server.once('error', failed);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      server.off('error', failed);
      listening();
    });
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Signal listener has no TCP address');
  }
  writeFileSync(join(directory, SIGNAL_PORT_FILE), String(address.port));
  const received = (name: string): Promise<void> => arrived.has(name) ? Promise.resolve()
    : new Promise((resolve) => { waiting.set(name, [...(waiting.get(name) ?? []), resolve]); });
  return { received };
}
