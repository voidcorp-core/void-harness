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
  let generation = 0;
  let lastFrameTs = 0;
  let staleTimer = 0;
  let knownPartial = false;
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

  const seedHistory = async (): Promise<string> => {
    try {
      const response = await fetch(`${baseUrl}/history`, { credentials: 'include' });
      if (!response.ok) throw new Error(`history fetch failed: ${response.status}`);
      knownPartial = response.headers.get('x-void-continuity') === 'partial';
      if (knownPartial) {
        dispatch({ type: 'setConnection', connection: 'PARTIAL' });
      }
      const events = (await response.json()) as StudioActivation[];
      const seeded: Lit[] = [];
      for (const ev of events) {
        const l = toLit(index, ev);
        if (l !== undefined) seeded.push(l);
      }
      lits = seeded.concat(lits);
      const first = seeded[0];
      const last = seeded[seeded.length - 1];
      if (first && last) dispatch({ type: 'setRange', min: first.ts, max: last.ts });
      return response.headers.get('x-void-last-event-id') ?? '';
    } catch {
      dispatch({ type: 'setConnection', connection: 'STALE' });
      return '';
    }
  };

  const extendRange = (ts: number): void => {
    if (ts <= state.range.max) return;
    dispatch({ type: 'setRange', min: state.range.max === 0 ? ts : state.range.min, max: ts });
  };

  const connect = (after: string): void => {
    const url = new URL(`${baseUrl}/events`);
    if (after !== '') url.searchParams.set('after', after);
    source = new EventSource(url, { withCredentials: true });
    source.onopen = () => {
      window.clearTimeout(staleTimer);
      dispatch({
        type: 'setConnection',
        connection: knownPartial ? 'PARTIAL' : 'LIVE',
      });
    };
    source.onerror = () => {
      dispatch({ type: 'setConnection', connection: 'RECONNECTING' });
      window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => {
        if (running) dispatch({ type: 'setConnection', connection: 'STALE' });
      }, 5_000);
    };
    source.addEventListener('stream-status', (event) => {
      try {
        const value = JSON.parse((event as MessageEvent).data) as { state?: unknown };
        knownPartial = value.state === 'PARTIAL';
        dispatch({
          type: 'setConnection',
          connection: knownPartial ? 'PARTIAL' : 'LIVE',
        });
      } catch {
        dispatch({ type: 'setConnection', connection: 'PARTIAL' });
      }
    });
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
    generation += 1;
    const currentGeneration = generation;
    if (on) {
      dispatch({ type: 'setConnection', connection: 'RECONNECTING' });
      void seedHistory().then((after) => {
        if (running && generation === currentGeneration) connect(after);
      });
      lastFrameTs = 0;
      raf = requestAnimationFrame(tick);
    } else {
      source?.close();
      source = undefined;
      window.clearTimeout(staleTimer);
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
