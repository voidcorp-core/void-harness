// Pure state of the live/replay scrubber. The shell (ui/scrubber.ts) renders it
// and drives `tick`; the render loop reads cursorMs to feed frameAt. No DOM, no
// timers, no clock here.

export type LiveMode = 'live' | 'replay';

export interface TimeRange {
  readonly min: number;
  readonly max: number;
}

export interface LiveState {
  readonly mode: LiveMode;
  readonly cursorMs: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly range: TimeRange;
}

export type LiveAction =
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'seek'; readonly ms: number }
  | { readonly type: 'setSpeed'; readonly speed: number }
  | { readonly type: 'toLive' }
  | { readonly type: 'toReplay'; readonly atMs: number }
  | { readonly type: 'setRange'; readonly min: number; readonly max: number }
  | { readonly type: 'tick'; readonly deltaMs: number };

const MIN_SPEED = 0.25;
const MAX_SPEED = 16;

export function clampCursor(ms: number, range: TimeRange): number {
  return Math.min(range.max, Math.max(range.min, ms));
}

export function defaultLiveState(): LiveState {
  return { mode: 'live', cursorMs: 0, playing: false, speed: 1, range: { min: 0, max: 0 } };
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'play':
      return { ...state, playing: true };
    case 'pause':
      return { ...state, playing: false };
    case 'seek':
      return { ...state, mode: 'replay', cursorMs: clampCursor(action.ms, state.range) };
    case 'setSpeed':
      return { ...state, speed: Math.min(MAX_SPEED, Math.max(MIN_SPEED, action.speed)) };
    case 'toLive':
      return { ...state, mode: 'live', playing: false };
    case 'toReplay':
      return { ...state, mode: 'replay', playing: false, cursorMs: clampCursor(action.atMs, state.range) };
    case 'setRange': {
      const range = { min: action.min, max: action.max };
      return { ...state, range, cursorMs: clampCursor(state.cursorMs, range) };
    }
    case 'tick':
      if (state.mode !== 'replay' || !state.playing) return state;
      return { ...state, cursorMs: clampCursor(state.cursorMs + action.deltaMs * state.speed, state.range) };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
