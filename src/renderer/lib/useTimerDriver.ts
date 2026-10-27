import { useEffect } from 'react';
import { useTimerStore, selectClockText, selectClockLabel } from '../store/useTimerStore';
import { msUntilClockChange, msUntilElapsedChange } from '../../shared/pomodoro';

const BASE_TITLE = 'Studeo';

/**
 * Drives the Pomodoro timer from the app shell so it keeps running no matter
 * which screen is mounted. The store derives remaining time from an end
 * timestamp, so a tick missed during navigation or background throttling
 * self-corrects on the next fire instead of drifting. Mount once, in Layout.
 */
export function useTimerDriver(): void {
  const isRunning  = useTimerStore(s => s.isRunning);
  const clockText  = useTimerStore(selectClockText);
  const clockLabel = useTimerStore(selectClockLabel);
  const tick       = useTimerStore(s => s.tick);

  // Tick when the CLOCK CHANGES, not every 1000ms, and correct immediately when the
  // window becomes visible again after the OS may have throttled us.
  //
  // A plain `setInterval(1000)` started firing at whatever instant Start was pressed,
  // which is not when the displayed value changes — the clock is rounded, so it flips
  // on the timer's own half-second boundaries. The two grids sit up to a full second
  // apart, and that gap was visible the moment there was a second clock to compare
  // against: the pop-out (which reads the same end time at render) ran up to a second
  // ahead of this window's digits, on the same timer. Scheduling each tick onto the
  // boundary puts every surface's flip at the same instant.
  //
  // Self-correcting by construction: the next delay is recomputed from the wall clock
  // after every fire, so a late tick is absorbed rather than accumulating as drift.
  useEffect(() => {
    if (!isRunning) return;

    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const { endsAt, countsFrom } = useTimerStore.getState();
      // An open session ticks on its own second boundaries (countsFrom), a countdown on
      // its end time's. No anchor at all is a paused timer mid-teardown; a hair over zero
      // keeps a phase that has already run out from busy-looping until the tick that ends it.
      const delay =
        countsFrom != null ? msUntilElapsedChange(countsFrom)
          : endsAt == null ? 1_000
            : Math.max(1, msUntilClockChange(endsAt));
      timer = setTimeout(() => { tick(); scheduleNext(); }, delay);
    };
    scheduleNext();

    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRunning, tick]);

  // Surface a running session in the window title so it's glanceable from any screen.
  useEffect(() => {
    document.title = isRunning
      ? `${clockText} · ${clockLabel} — ${BASE_TITLE}`
      : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [isRunning, clockText, clockLabel]);
}
