// Clocks use timestamp deltas, never interval counting. Browsers throttle
// setInterval in background tabs, so counting ticks loses time whenever the
// window is not focused, which on a timed test tool is a correctness bug.
// The display refresh rate and the timekeeping are separate concerns.
import { TAB_BLUR_THRESHOLD_MS } from './lib/constants.js';

export function makeClock({ durationMs = null, onTick, onExpire, tickMs = 250 }) {
  let startedAt = null, handle = null, fired = false;
  function frame() {
    const elapsed = Date.now() - startedAt;
    const remaining = durationMs === null ? null : Math.max(0, durationMs - elapsed);
    onTick?.({ elapsed, remaining });
    if (durationMs !== null && remaining === 0 && !fired) { fired = true; stop(); onExpire?.(); }
  }
  function start(fromMs = 0) {
    startedAt = Date.now() - fromMs; fired = false;
    frame();
    handle = setInterval(frame, tickMs);
  }
  function stop() { if (handle) clearInterval(handle); handle = null; }
  return {
    start, stop,
    elapsed: () => startedAt === null ? 0 : Date.now() - startedAt,
    remaining: () => durationMs === null ? null : Math.max(0, durationMs - (Date.now() - startedAt)),
  };
}

// How far into a session we already are.
//
// makeClock has always accepted start(fromMs) and it was never once called with an argument, so
// every clock started from its full duration. Two consequences, both reachable by accident: a
// refresh mid-exam handed back the full 25 minutes, which makes Exam mode's number meaningless when
// the mode exists to be a measurement, and returning to a session after navigating away left it with
// no clock at all. The session's startedAt was already stored and already passed through resume().
export function elapsedSince(startedAt) {
  const t = Date.parse(startedAt ?? '');
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Date.now() - t);
}

export function mmss(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// The clock is never paused: a timed session that pauses is not a timed session. Long blurs are
// recorded so a suspiciously good session can be identified in review.
export function trackVisibility(onBlur) {
  let hiddenAt = null;
  const handler = () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt) {
      const ms = Date.now() - hiddenAt;
      hiddenAt = null;
      if (ms > TAB_BLUR_THRESHOLD_MS) onBlur({ at: new Date().toISOString(), ms });
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
