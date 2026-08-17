import { existsSync, lstatSync, readFileSync } from 'node:fs';
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import {
  buildLiveSnapshot,
  type LiveEvent,
  type LiveSnapshot,
} from './graph-live.js';
import {
  createLiveAuth,
  sessionCookie,
  type LiveAuth,
} from './graph-live-auth.js';

export interface LiveServerOptions {
  readonly port: number;
  readonly logPath: string;
  readonly modelJson: string;
  readonly catalogJson?: string | undefined;
  readonly launchToken: string;
  readonly studioHtml?: string | undefined;
  readonly studioDataJson?: string | undefined;
  readonly pollMs?: number;
  readonly historyMax?: number;
  /** Canonical + legacy body provider. Defaults to the bounded `logPath` file. */
  readonly readEventBody?: (() => string) | undefined;
  readonly onListening?: (port: number) => void;
}

const LOOPBACK = '127.0.0.1';
const PORT_RETRIES = 20;
const LOCALHOST_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function corsFor(origin: string | undefined): Record<string, string> {
  if (origin !== undefined && LOCALHOST_ORIGIN.test(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    };
  }
  return {};
}

function foreignOrigin(origin: string | undefined): boolean {
  return origin !== undefined && !LOCALHOST_ORIGIN.test(origin);
}

/**
 * Exported so every local server the harness starts carries the same posture.
 * A second definition drifts, and the copy that drifts is the one that stops
 * refusing to be framed.
 */
export function securityHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function safeLogBody(path: string): string {
  if (!existsSync(path)) return '';
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024 * 1024) {
      return '';
    }
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function snapshot(opts: LiveServerOptions): LiveSnapshot {
  let body = '';
  try {
    body = opts.readEventBody?.() ?? safeLogBody(opts.logPath);
  } catch {
    body = '';
  }
  return buildLiveSnapshot(body, opts.historyMax ?? 5_000);
}

function streamState(value: LiveSnapshot): 'LIVE' | 'PARTIAL' {
  return value.continuity === 'partial' || value.truncated ? 'PARTIAL' : 'LIVE';
}

function writeStatus(
  res: ServerResponse,
  state: 'LIVE' | 'PARTIAL',
  reason?: string,
): void {
  res.write(
    `event: stream-status\ndata: ${JSON.stringify({
      state,
      ...(reason === undefined ? {} : { reason }),
    })}\n\n`,
  );
}

function writeEvent(res: ServerResponse, event: LiveEvent): void {
  res.write(
    `id: ${event.id}\nevent: activation\ndata: ${JSON.stringify(event.activation)}\n\n`,
  );
}

function afterCursor(
  value: LiveSnapshot,
  cursor: string,
): { events: readonly LiveEvent[]; cursorFound: boolean } {
  const index = value.events.findIndex((event) => event.id === cursor);
  return index < 0
    ? { events: value.events, cursorFound: false }
    : { events: value.events.slice(index + 1), cursorFound: true };
}

function streamEvents(
  req: IncomingMessage,
  res: ServerResponse,
  opts: LiveServerOptions,
  cors: Record<string, string>,
  url: URL,
): void {
  res.writeHead(200, {
    ...cors,
    ...securityHeaders(),
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
  });
  res.write('retry: 1000\n: connected\n\n');

  const first = snapshot(opts);
  const headerCursor = req.headers['last-event-id'];
  const cursor = typeof headerCursor === 'string'
    ? headerCursor
    : url.searchParams.get('after') ?? '';
  const sentIds = new Set(first.events.map((event) => event.id));
  if (cursor !== '') {
    const backfill = afterCursor(first, cursor);
    if (!backfill.cursorFound) {
      writeStatus(res, 'PARTIAL', 'cursor-unavailable');
    } else {
      writeStatus(res, streamState(first));
    }
    for (const event of backfill.events) writeEvent(res, event);
  } else {
    writeStatus(res, streamState(first));
  }

  const poll = setInterval(() => {
    const current = snapshot(opts);
    if (streamState(current) === 'PARTIAL') {
      writeStatus(res, 'PARTIAL', 'journal-discontinuity');
    }
    for (const event of current.events) {
      if (sentIds.has(event.id)) continue;
      sentIds.add(event.id);
      writeEvent(res, event);
    }
    if (sentIds.size > (opts.historyMax ?? 5_000) * 2) {
      sentIds.clear();
      for (const event of current.events) sentIds.add(event.id);
    }
  }, opts.pollMs ?? 500);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  res.on('close', () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  });
}

function exchangeLaunchToken(
  res: ServerResponse,
  auth: LiveAuth,
  url: URL,
): void {
  const supplied = url.searchParams.get('token') ?? '';
  const session = auth.exchange(supplied);
  if (session === undefined) {
    res.writeHead(401, { ...securityHeaders(), 'Content-Type': 'text/plain' });
    res.end('invalid or consumed launch token');
    return;
  }
  res.writeHead(303, {
    ...securityHeaders(),
    'Set-Cookie': sessionCookie(session),
    Location: '/',
  });
  res.end();
}

function json(
  res: ServerResponse,
  cors: Record<string, string>,
  body: string,
  extra: Record<string, string> = {},
): void {
  res.writeHead(200, {
    ...cors,
    ...securityHeaders(),
    ...extra,
    'Content-Type': 'application/json',
  });
  res.end(body);
}

function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: LiveServerOptions,
  auth: LiveAuth,
): void {
  const origin = req.headers.origin;
  if (foreignOrigin(origin)) {
    res.writeHead(403, { ...securityHeaders(), 'Content-Type': 'text/plain' });
    res.end('foreign origins are forbidden');
    return;
  }
  const cors = corsFor(origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...cors,
      ...securityHeaders(),
      'Access-Control-Allow-Headers': 'Last-Event-ID, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/auth') {
    exchangeLaunchToken(res, auth, url);
    return;
  }
  if (!auth.authorized(req.headers.cookie)) {
    res.writeHead(401, { ...cors, ...securityHeaders(), 'Content-Type': 'text/plain' });
    res.end('authentication required');
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (opts.studioHtml === undefined) {
      res.writeHead(404, { ...cors, ...securityHeaders(), 'Content-Type': 'text/plain' });
      res.end('studio not bundled (data-only server)');
      return;
    }
    res.writeHead(200, {
      ...cors,
      ...securityHeaders(),
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.end(opts.studioHtml);
    return;
  }
  if (url.pathname === '/model.json') {
    json(res, cors, opts.modelJson);
    return;
  }
  if (url.pathname === '/catalog.v3.json') {
    if (opts.catalogJson === undefined) {
      res.writeHead(404, { ...cors, ...securityHeaders(), 'Content-Type': 'text/plain' });
      res.end('CatalogGraph v3 not computed');
      return;
    }
    json(res, cors, opts.catalogJson);
    return;
  }
  if (url.pathname === '/studio-data.json') {
    if (opts.studioDataJson === undefined) {
      res.writeHead(404, { ...cors, ...securityHeaders(), 'Content-Type': 'text/plain' });
      res.end('studio data not computed');
      return;
    }
    json(res, cors, opts.studioDataJson);
    return;
  }
  if (url.pathname === '/history') {
    const current = snapshot(opts);
    const last = current.events.at(-1)?.id ?? '';
    json(
      res,
      cors,
      JSON.stringify(current.events.map((event) => event.activation)),
      {
        'X-Void-Continuity': streamState(current).toLowerCase(),
        ...(last === '' ? {} : { 'X-Void-Last-Event-ID': last }),
      },
    );
    return;
  }
  if (url.pathname === '/events') {
    streamEvents(req, res, opts, cors, url);
    return;
  }
  res.writeHead(404, { ...cors, ...securityHeaders(), 'Content-Type': 'text/plain' });
  res.end('not found');
}

/** Start a loopback-only, cookie-authenticated live SSE server. */
export function startLiveServer(opts: LiveServerOptions): Server {
  const auth = createLiveAuth(opts.launchToken);
  const server = createServer((req, res) => handle(req, res, opts, auth));
  let port = opts.port;
  server.on('listening', () => {
    const address = server.address();
    opts.onListening?.(
      typeof address === 'object' && address ? address.port : port,
    );
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (
      error.code === 'EADDRINUSE'
      && opts.port !== 0
      && port - opts.port < PORT_RETRIES
    ) {
      port += 1;
      server.listen(port, LOOPBACK);
      return;
    }
    throw error;
  });
  server.listen(port, LOOPBACK);
  return server;
}
