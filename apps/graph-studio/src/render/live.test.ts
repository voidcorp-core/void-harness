import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraphModel } from '@voidcorp/harness-graph';
import { startLive } from './live.js';

class FakeEventSource {
  static instance: FakeEventSource | undefined;
  readonly listeners = new Map<string, (event: MessageEvent) => void>();
  readonly url: string;
  readonly withCredentials: boolean;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: URL, options: EventSourceInit) {
    this.url = String(url);
    this.withCredentials = options.withCredentials ?? false;
    FakeEventSource.instance = this;
  }

  addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, listener as (event: MessageEvent) => void);
  }

  emit(name: string, data: string): void {
    this.listeners.get(name)?.({ data } as MessageEvent);
  }

  close(): void {
    this.closed = true;
  }
}

const model: GraphModel = { version: 1, nodes: [], edges: [] };

describe('live transport truth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.instance = undefined;
  });

  it('moves through reconnecting, partial, live and offline with a replay cursor', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('[]', {
        status: 200,
        headers: {
          'X-Void-Continuity': 'partial',
          'X-Void-Last-Event-ID': 'evt_00000050',
        },
      })));
    const target = { applyLiveFrame: vi.fn() };
    const controller = startLive(target, model, 'http://localhost:4317');

    controller.setEnabled(true);
    expect(controller.getState().connection).toBe('RECONNECTING');
    await vi.waitFor(() => expect(FakeEventSource.instance).toBeDefined());
    const source = FakeEventSource.instance;
    expect(source?.url).toContain('after=evt_00000050');
    expect(source?.withCredentials).toBe(true);
    expect(controller.getState().connection).toBe('PARTIAL');

    source?.emit('stream-status', JSON.stringify({ state: 'LIVE' }));
    expect(controller.getState().connection).toBe('LIVE');
    source?.onerror?.();
    expect(controller.getState().connection).toBe('RECONNECTING');

    controller.setEnabled(false);
    expect(source?.closed).toBe(true);
    expect(controller.getState().connection).toBe('OFFLINE');
  });
});
