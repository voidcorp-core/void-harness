// Imperative shell for `graph live`: a zero-dependency node:http server that
// serves the model and tails .void/activations.jsonl as a Server-Sent Events
// stream. Pure parsing/splitting lives in ./graph-live.ts. Data-only by design
// (no static studio) — the HTTP contract is a superset the future all-in-one
// server can extend with a `GET /` -> dist route without breaking clients.

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { type ActivationEvent, parseActivationLine, splitNewLines } from './graph-live.js';

export interface LiveServerOptions {
  readonly port: number;
  readonly logPath: string;
  /** Serialized model.json served at GET /model.json. */
  readonly modelJson: string;
  /** Self-contained studio HTML served at GET /. Absent -> data-only server (GET / -> 404). */
  readonly studioHtml?: string | undefined;
  /** Pre-computed StudioData JSON served at GET /studio-data.json (server-fed studio mode). */
  readonly studioDataJson?: string | undefined;
  readonly pollMs?: number;
  /** Max events returned by GET /history (most recent kept). Default 5000. */
  readonly historyMax?: number;
  readonly onListening?: (port: number) => void;
}

/** Bind loopback only — the studio is a local-first tool; never expose it on the LAN. */
const LOOPBACK = '127.0.0.1';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * CORS headers for one request. The server binds loopback, but a browser page can still reach
 * 127.0.0.1, and a wildcard `Access-Control-Allow-Origin: *` would let ANY website read the graph /
 * cost / activation data while `graph live` runs. So we reflect the Origin ONLY for localhost
 * origins (the dev studio runs cross-port), and send no CORS header otherwise — the browser's
 * same-origin policy then blocks a foreign page from reading the response. No Origin (same-origin or
 * a non-browser client like curl) needs no header.
 */
export function corsFor(origin: string | undefined): Record<string, string> {
  if (origin !== undefined && LOCALHOST_ORIGIN.test(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return {};
}

/** Read bytes appended to `path` since `offset`; returns the new chunk + new size. */
function readFrom(path: string, offset: number): { chunk: string; size: number } {
  const size = statSync(path).size;
  if (size <= offset) return { chunk: '', size };
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    return { chunk: buf.toString('utf8'), size };
  } finally {
    closeSync(fd);
  }
}

function streamEvents(res: ServerResponse, logPath: string, pollMs: number, cors: Record<string, string>): void {
  res.writeHead(200, {
    ...cors,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  // Start at the current end of file: /events streams only NEW activations;
  // the past is served by /history (so reconnects do not replay duplicates).
  let offset = existsSync(logPath) ? statSync(logPath).size : 0;
  let rest = '';

  const poll = setInterval(() => {
    if (!existsSync(logPath)) return;
    const { chunk, size } = readFrom(logPath, offset);
    if (size < offset) offset = 0; // file truncated/rotated -> resync
    if (chunk === '') return;
    offset = size;
    const split = splitNewLines(rest + chunk);
    rest = split.rest;
    for (const line of split.lines) {
      const ev = parseActivationLine(line);
      if (ev !== undefined) res.write(`event: activation\ndata: ${JSON.stringify(ev)}\n\n`);
    }
  }, pollMs);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  res.on('close', () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  });
}

/** Read the whole log, parse every valid line, keep the most recent `max`. */
function readHistory(logPath: string, max: number): ActivationEvent[] {
  if (!existsSync(logPath)) return [];
  const events: ActivationEvent[] = [];
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const ev = parseActivationLine(line);
    if (ev !== undefined) events.push(ev);
  }
  return events.length > max ? events.slice(events.length - max) : events;
}

function handle(req: IncomingMessage, res: ServerResponse, opts: LiveServerOptions): void {
  const url = req.url ?? '/';
  const cors = corsFor(req.headers.origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (url === '/' || url === '/index.html') {
    if (opts.studioHtml === undefined) {
      res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
      res.end('studio not bundled (data-only server); use /model.json, /history, /events');
      return;
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(opts.studioHtml);
    return;
  }
  if (url === '/model.json') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(opts.modelJson);
    return;
  }
  if (url === '/studio-data.json') {
    if (opts.studioDataJson === undefined) {
      res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
      res.end('studio data not computed (data-only server)');
      return;
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(opts.studioDataJson);
    return;
  }
  if (url.startsWith('/history')) {
    const history = readHistory(opts.logPath, opts.historyMax ?? 5000);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(history));
    return;
  }
  if (url.startsWith('/events')) {
    streamEvents(res, opts.logPath, opts.pollMs ?? 500, cors);
    return;
  }
  res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
  res.end('not found');
}

/** Max consecutive ports to try when the requested one is busy. */
const PORT_RETRIES = 20;

/** Start the live SSE server on loopback. Returns the http.Server (call .close() to stop). */
export function startLiveServer(opts: LiveServerOptions): Server {
  const server = createServer((req, res) => handle(req, res, opts));
  let port = opts.port;
  server.on('listening', () => {
    const addr = server.address();
    // Report the actually-bound port (matters for port 0 and the port-increment fallback).
    opts.onListening?.(typeof addr === 'object' && addr ? addr.port : port);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    // Requested port busy: walk forward a bounded number of ports. Port 0 lets the OS pick, so
    // it never collides and is never incremented.
    if (err.code === 'EADDRINUSE' && opts.port !== 0 && port - opts.port < PORT_RETRIES) {
      port += 1;
      server.listen(port, LOOPBACK);
      return;
    }
    throw err;
  });
  server.listen(port, LOOPBACK);
  return server;
}
