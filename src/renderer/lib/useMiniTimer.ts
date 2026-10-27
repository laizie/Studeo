import { useCallback, useEffect, useState } from 'react';
import { useTimerStore, clockStateOf } from '../store/useTimerStore';

/**
 * The main window's half of the pop-out timer.
 *
 * The pop-out is a second BrowserWindow with its own JavaScript context — it cannot
 * see this window's Zustand store, and giving it one of its own would mean two
 * independent countdowns (and, because the store logs a session during startup
 * recovery, duplicate rows in the database). So this window stays the single owner:
 * it publishes snapshots out, and runs the pill's button presses against the real
 * store actions. See main/timerWindow.ts for the other end of the relay.
 */

/**
 * Publish timer state to the pop-out, and apply commands coming back from it.
 * Mount once, in Layout, beside useTimerDriver.
 */
export function useMiniTimerBridge(): void {
  useEffect(() => {
    // Publish on real change only. tick() writes `timeLeft` once a second, but while
    // the timer is RUNNING that field is derived from `endsAt` — which the pop-out has
    // and can do its own arithmetic on. Comparing on everything-but-timeLeft-while-
    // running turns a message-per-second into a message-per-transition. (timeLeft is
    // still compared while paused: that's the one state where it's the truth.)
    let lastKey = '';

    const publish = (state: ReturnType<typeof useTimerStore.getState>) => {
      // The same snapshot every clock in this window reads (useTimerStore's clockStateOf).
      const snap = clockStateOf(state);
      const key = JSON.stringify({ ...snap, timeLeft: snap.isRunning ? 0 : snap.timeLeft });
      if (key === lastKey) return;
      lastKey = key;
      window.api.miniTimer.publish(snap);
    };

    // Once now, so a pop-out opened later has something correct to paint immediately
    // (main caches the last snapshot and replays it on open).
    publish(useTimerStore.getState());
    return useTimerStore.subscribe(publish);
  }, []);

  useEffect(() =>
    window.api.miniTimer.onCommand((command) => {
      // Deliberately the same store actions the Study page's buttons call — the pill
      // is another set of buttons on one timer, not a second way to run one.
      const { start, pause, skip } = useTimerStore.getState();
      if (command === 'start')      start();
      else if (command === 'pause') pause();
      else if (command === 'skip')  skip();
    }), []);
}

/**
 * Whether the pop-out is up, plus a toggle — for the button that opens it.
 *
 * The `isOpen` flag is pushed from main rather than kept locally, because the pill can
 * also be closed from its own ×, or by the app when the main window closes. A local
 * boolean would go stale and the button would start lying.
 */
export function useMiniTimerWindow(): { isOpen: boolean; toggle: () => void } {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void window.api.miniTimer.isOpen().then(setIsOpen);
    return window.api.miniTimer.onOpenChanged(setIsOpen);
  }, []);

  const toggle = useCallback(() => {
    void window.api.miniTimer.toggle().then(setIsOpen);
  }, []);

  return { isOpen, toggle };
}
