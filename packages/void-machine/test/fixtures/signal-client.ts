import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

/** File in which the test publishes the loopback port its signal listener accepts on. */
export const SIGNAL_PORT_FILE = 'signal.port';

/** Announces a barrier to the test listening for `directory`; rejects if none listens. */
export function sendSignal(directory: string, name: string): Promise<void> {
  return new Promise((sent, failed) => {
    const port = Number(readFileSync(join(directory, SIGNAL_PORT_FILE), 'utf8'));
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('error', failed);
    socket.end(`${name}\n`, sent);
  });
}
