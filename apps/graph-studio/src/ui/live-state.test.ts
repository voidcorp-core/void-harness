import { describe, expect, it } from 'vitest';
import { clampCursor, defaultLiveState, liveReducer } from './live-state.js';

const ranged = () => liveReducer(defaultLiveState(), { type: 'setRange', min: 0, max: 100 });

describe('defaultLiveState', () => {
  it('starts in live mode, paused, at speed 1', () => {
    const s = defaultLiveState();
    expect(s.mode).toBe('live');
    expect(s.playing).toBe(false);
    expect(s.speed).toBe(1);
  });
});

describe('clampCursor', () => {
  it('clamps to the range bounds', () => {
    expect(clampCursor(150, { min: 0, max: 100 })).toBe(100);
    expect(clampCursor(-10, { min: 0, max: 100 })).toBe(0);
    expect(clampCursor(42, { min: 0, max: 100 })).toBe(42);
  });
});

describe('liveReducer', () => {
  it('seek switches to replay and clamps the cursor into range', () => {
    const s = liveReducer(ranged(), { type: 'seek', ms: 150 });
    expect(s.mode).toBe('replay');
    expect(s.cursorMs).toBe(100);
  });

  it('toLive returns to live mode and stops playback', () => {
    const replaying = liveReducer(ranged(), { type: 'toReplay', atMs: 50 });
    const s = liveReducer({ ...replaying, playing: true }, { type: 'toLive' });
    expect(s.mode).toBe('live');
    expect(s.playing).toBe(false);
  });

  it('tick is a no-op while paused', () => {
    const s = liveReducer(liveReducer(ranged(), { type: 'toReplay', atMs: 50 }), { type: 'tick', deltaMs: 10 });
    expect(s.cursorMs).toBe(50);
  });

  it('tick advances the cursor by delta * speed in replay while playing', () => {
    let s = liveReducer(ranged(), { type: 'toReplay', atMs: 0 });
    s = liveReducer({ ...s, speed: 2, playing: true }, { type: 'tick', deltaMs: 10 });
    expect(s.cursorMs).toBe(20);
  });

  it('tick never exceeds the range max', () => {
    let s = liveReducer(ranged(), { type: 'toReplay', atMs: 95 });
    s = liveReducer({ ...s, playing: true, speed: 1 }, { type: 'tick', deltaMs: 999 });
    expect(s.cursorMs).toBe(100);
  });

  it('tick does nothing in live mode', () => {
    const s = liveReducer({ ...ranged(), playing: true }, { type: 'tick', deltaMs: 10 });
    expect(s.cursorMs).toBe(ranged().cursorMs);
    expect(s.mode).toBe('live');
  });

  it('setSpeed floors at a positive minimum', () => {
    expect(liveReducer(defaultLiveState(), { type: 'setSpeed', speed: 0 }).speed).toBeGreaterThan(0);
    expect(liveReducer(defaultLiveState(), { type: 'setSpeed', speed: 4 }).speed).toBe(4);
  });

  it('setRange clamps the existing cursor into the new bounds', () => {
    const s = liveReducer({ ...defaultLiveState(), cursorMs: 999 }, { type: 'setRange', min: 0, max: 100 });
    expect(s.cursorMs).toBe(100);
    expect(s.range).toEqual({ min: 0, max: 100 });
  });
});
