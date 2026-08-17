// `void-harness ui` — serve the projects view on localhost, then stop.
//
// Not a daemon, on purpose. A resident process adds a lifecycle to supervise, a
// port to remember, and a cache whose staleness has to be explained at every
// anomaly. This starts when asked, serves, and dies with the terminal.
//
// The server holds no knowledge of what a project is: it is handed the same
// reader the CLI uses. That is what keeps `--json` and the page in agreement by
// construction.

import { randomBytes } from 'node:crypto';
import { COMMAND_CENTER_HTML } from '../lib/ui/page.js';
import { readProjectsPayload } from '../lib/ui/payload.js';
import { startCommandCenter } from '../lib/ui/server.js';
import { banner, blank, c, footer, line, meta } from '../lib/render.js';

const DEFAULT_PORT = 7777;

function requestedPort(args: readonly string[]): number {
  const index = args.indexOf('--port');
  if (index < 0) return DEFAULT_PORT;
  const raw = Number(args[index + 1]);
  return Number.isInteger(raw) && raw > 0 && raw < 65_536 ? raw : DEFAULT_PORT;
}

export async function ui(args: readonly string[]): Promise<void> {
  const launchToken = randomBytes(32).toString('base64url');

  banner('ui');

  await new Promise<void>((resolve) => {
    const server = startCommandCenter({
      port: requestedPort(args),
      launchToken,
      // Read per request, never once at startup: a page opened this morning
      // must not still be showing this morning's tree.
      read: () => readProjectsPayload(),
      html: COMMAND_CENTER_HTML,
      onListening: (port) => {
        meta('url', `http://127.0.0.1:${String(port)}/auth?token=${launchToken}`);
        blank();
        line(c.dim('Loopback only. The link carries a one-shot token; keep it out of shared logs.'));
        line(c.dim('Reads the park on every request and writes nothing. Ctrl-C to stop.'));
        blank();
        footer('serving');
      },
    });

    const stop = (): void => {
      server.close(() => resolve());
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
