import type { GraphModel } from '@voidcorp/harness-graph';
import { buildActivationIndex, frameAt, type Lit, type StudioActivation, toLit } from '../scene/live.js';
import { type LiveAction, type LiveState, defaultLiveState, liveReducer } from '../ui/live-state.js';

// Imperative shell of the live layer. Subscribes to the SSE stream, seeds the
// past from /history, and each frame drives the pure frameAt() at the cursor the
// scrubber state dictates: now in live mode, the scrubber position in replay.
// One pure calculation, two pilots. The clock and network live here.

const WINDOW_MS = 6000;

interface LiveTarget {
  applyLiveFrame(frame: ReadonlyMap<string, number>): void;
}

export interface LiveController {
  /** Toggle the subscription + render loop (driven by the `live` layer). */
  setEnabled(on: boolean): void;
  dispatch(action: LiveAction): void;
  getState(): LiveState;
  onState(cb: (s: LiveState) => void): void;
}

export function startLive(handle: LiveTarget, model: GraphModel, baseUrl: string): LiveController {
  const index = buildActivationIndex(model);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lits: Lit[] = [];
  let state = defaultLiveState();
  let source: EventSource | undefined;
  let raf = 0;
  let running = false;
  let lastFrameTs = 0;
  const listeners = new Set<(s: LiveState) => void>();

  const emit = (): void => {
    for (const cb of listeners) cb(state);
  };
  const dispatch = (action: LiveAction): void => {
    state = liveReducer(state, action);
    emit();
  };

  const tick = (ts: number): void => {
    const delta = lastFrameTs === 0 ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;
    if (state.mode === 'replay' && state.playing) dispatch({ type: 'tick', deltaMs: delta });
    const cursor = state.mode === 'live' ? Date.now() : state.cursorMs;
    const frame = frameAt(lits, cursor, WINDOW_MS);
    if (reduced) for (const k of frame.keys()) frame.set(k, 1); // binary on/off, no pulsing
    handle.applyLiveFrame(frame);
    if (running) raf = requestAnimationFrame(tick);
  };

  const seedHistory = async (): Promise<void> => {
    try {
      const events = (await (await fetch(`${baseUrl}/history`)).json()) as StudioActivation[];
      const seeded: Lit[] = [];
      for (const ev of events) {
        const l = toLit(index, ev);
        if (l !== undefined) seeded.push(l);
      }
      lits = seeded.concat(lits);
      const first = seeded[0];
      const last = seeded[seeded.length - 1];
      if (first && last) dispatch({ type: 'setRange', min: first.ts, max: last.ts });
    } catch {
      // tolerant: live still works without history (scrubber range stays empty)
    }
  };

  const extendRange = (ts: number): void => {
    if (ts <= state.range.max) return;
    dispatch({ type: 'setRange', min: state.range.max === 0 ? ts : state.range.min, max: ts });
  };

  const connect = (): void => {
    source = new EventSource(`${baseUrl}/events`);
    source.addEventListener('activation', (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as StudioActivation;
        const lit = toLit(index, ev);
        if (lit !== undefined) {
          lits.push(lit);
          extendRange(lit.ts);
        }
      } catch {
        // tolerant: a malformed event must not break the stream
      }
    });
  };

  const setEnabled = (on: boolean): void => {
    if (on === running) return;
    running = on;
    if (on) {
      void seedHistory();
      connect();
      lastFrameTs = 0;
      raf = requestAnimationFrame(tick);
    } else {
      source?.close();
      source = undefined;
      cancelAnimationFrame(raf);
      handle.applyLiveFrame(new Map()); // reset every pulse
      lits = [];
      state = defaultLiveState();
      emit();
    }
  };

  return {
    setEnabled,
    dispatch,
    getState: () => state,
    onState: (cb) => {
      listeners.add(cb);
    },
  };
}
