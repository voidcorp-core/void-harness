import type { GraphModel } from '@voidcorp/harness-graph';
import { buildActivationIndex, frameAt, type Lit, type StudioActivation, toLit } from '../scene/live.js';

// Imperative shell of the live layer: subscribe to the SSE stream, accumulate
// lit nodes, and drive the per-frame pulse via the pure frameAt(). The clock and
// the network live here; all intensity math is in scene/live.ts.

const WINDOW_MS = 6000;

interface LiveTarget {
  applyLiveFrame(frame: ReadonlyMap<string, number>): void;
}

export interface LiveController {
  /** Toggle the live subscription + render loop (driven by the `live` layer). */
  setEnabled(on: boolean): void;
}

export function startLive(handle: LiveTarget, model: GraphModel, baseUrl: string): LiveController {
  const index = buildActivationIndex(model);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lits: Lit[] = [];
  let source: EventSource | undefined;
  let raf = 0;
  let running = false;

  const tick = (): void => {
    const now = Date.now();
    if (lits.length > 4000) lits = lits.filter((l) => now - l.ts < WINDOW_MS);
    const frame = frameAt(lits, now, WINDOW_MS);
    if (reduced) for (const k of frame.keys()) frame.set(k, 1); // binary on/off, no pulsing
    handle.applyLiveFrame(frame);
    if (running) raf = requestAnimationFrame(tick);
  };

  const connect = (): void => {
    source = new EventSource(`${baseUrl}/events`);
    source.addEventListener('activation', (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as StudioActivation;
        const lit = toLit(index, ev);
        if (lit !== undefined) lits.push(lit);
      } catch {
        // tolerant: a malformed event must not break the stream
      }
    });
  };

  const setEnabled = (on: boolean): void => {
    if (on === running) return;
    running = on;
    if (on) {
      connect();
      raf = requestAnimationFrame(tick);
    } else {
      source?.close();
      source = undefined;
      cancelAnimationFrame(raf);
      handle.applyLiveFrame(new Map()); // reset every pulse
      lits = [];
    }
  };

  return { setEnabled };
}
