import type { LiveController } from '../render/live.js';
import { type LiveState, visibleLiveStatus } from './live-state.js';

// Imperative shell: the replay timeline. Renders the live/replay controls and
// drives the pure liveReducer (via the controller). The render loop reads the
// resulting cursor to feed frameAt -- so live and replay share one calculation.

const SPEEDS = [0.5, 1, 2, 4] as const;

function fmt(ms: number): string {
  if (ms <= 0) return '--:--:--';
  return new Date(ms).toISOString().slice(11, 19); // HH:MM:SS (UTC)
}

/** Mount the scrubber into `host`, wiring its controls to the live controller. */
export function mountScrubber(host: HTMLElement, ctrl: LiveController): void {
  host.classList.add('scrubber');
  host.innerHTML = '';

  const liveBtn = document.createElement('button');
  liveBtn.textContent = 'LIVE';
  liveBtn.className = 'scrubber-live';

  const playBtn = document.createElement('button');
  playBtn.textContent = '▶';
  playBtn.className = 'scrubber-play';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'scrubber-range';

  const speed = document.createElement('select');
  speed.className = 'scrubber-speed';
  for (const s of SPEEDS) {
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = `${s}x`;
    if (s === 1) opt.selected = true;
    speed.append(opt);
  }

  const time = document.createElement('span');
  time.className = 'scrubber-time';

  host.append(liveBtn, playBtn, slider, speed, time);

  liveBtn.addEventListener('click', () => ctrl.dispatch({ type: 'toLive' }));
  playBtn.addEventListener('click', () => {
    const s = ctrl.getState();
    if (s.playing) ctrl.dispatch({ type: 'pause' });
    else {
      if (s.mode === 'live') ctrl.dispatch({ type: 'toReplay', atMs: s.range.min });
      ctrl.dispatch({ type: 'play' });
    }
  });
  slider.addEventListener('input', () => ctrl.dispatch({ type: 'seek', ms: Number(slider.value) }));
  speed.addEventListener('change', () => ctrl.dispatch({ type: 'setSpeed', speed: Number(speed.value) }));

  const sync = (s: LiveState): void => {
    const hasRange = s.range.max > s.range.min;
    slider.min = String(s.range.min);
    slider.max = String(s.range.max);
    slider.value = String(s.mode === 'live' ? s.range.max : s.cursorMs);
    slider.disabled = !hasRange;
    playBtn.textContent = s.playing ? '⏸' : '▶';
    playBtn.disabled = !hasRange;
    const status = visibleLiveStatus(s);
    liveBtn.textContent = status;
    liveBtn.classList.toggle('is-active', status === 'LIVE');
    liveBtn.setAttribute('data-status', status.toLowerCase());
    time.textContent = s.mode === 'live' ? status.toLowerCase() : fmt(s.cursorMs);
  };

  ctrl.onState(sync);
  sync(ctrl.getState());
}
