import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

/** Socket a held fixture process connects to, in the directory it runs from. */
export const SIGNAL_SOCKET = 'signal.sock';

/**
 * Receives the named lines fixture processes send when they reach a barrier, so a test
 * waits on the event itself instead of polling a file under an assertion deadline. The
 * test bound stays the only bound on a signal that never comes.
 */
export function processSignals(directory: string) {
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
  // A listener failure is a broken test environment, never a signal that did not come.
  server.once('error', (error) => { throw error; });
  server.listen(join(directory, SIGNAL_SOCKET));
  onTestFinished(() => new Promise<void>((resolve) => {
    for (const socket of sockets) socket.destroy();
    server.close(() => { resolve(); });
  }));
  const received = (name: string): Promise<void> => arrived.has(name) ? Promise.resolve()
    : new Promise((resolve) => { waiting.set(name, [...(waiting.get(name) ?? []), resolve]); });
  return { received };
}
