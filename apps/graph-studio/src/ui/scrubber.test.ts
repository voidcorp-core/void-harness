import { describe, expect, it } from 'vitest';
import { defaultLiveState, liveReducer } from './live-state.js';
import { scrubberView } from './scrubber.js';

describe('scrubberView', () => {
  it('renders explicit transport truth while the scrubber is live', () => {
    const partial = liveReducer(defaultLiveState(), {
      type: 'setConnection',
      connection: 'PARTIAL',
    });

    expect(scrubberView(partial)).toEqual({
      active: false,
      dataStatus: 'partial',
      liveLabel: 'PARTIAL',
      timeLabel: 'partial',
    });
  });

  it('renders replay independently from the transport connection', () => {
    const connected = liveReducer(defaultLiveState(), {
      type: 'setConnection',
      connection: 'LIVE',
    });
    const replay = {
      ...liveReducer(connected, { type: 'toReplay', atMs: 1_000 }),
      cursorMs: 1_000,
    };

    expect(scrubberView(replay)).toEqual({
      active: false,
      dataStatus: 'replay',
      liveLabel: 'REPLAY',
      timeLabel: '00:00:01',
    });
  });
});
