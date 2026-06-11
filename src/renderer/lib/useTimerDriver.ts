import { useEffect } from 'react';
import { useTimerStore } from '../store/useTimerStore';

const BASE_TITLE = 'Studeo';

function mmss(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/**
 * Drives the Pomodoro timer from the app shell so it keeps running no matter
 * which screen is mounted. The store derives remaining time from an end
 * timestamp, so a tick missed during navigation or background throttling
 * self-corrects on the next fire instead of drifting. Mount once, in Layout.
 */
export function useTimerDriver(): void {
  const isRunning = useTimerStore(s => s.isRunning);
  const timeLeft  = useTimerStore(s => s.timeLeft);
  const phase     = useTimerStore(s => s.phase);
  const tick      = useTimerStore(s => s.tick);

  // Tick every second while running, and correct immediately when the window
  // becomes visible again after the OS may have throttled the interval.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => tick(), 1_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRunning, tick]);

  // Surface a running session in the window title so it's glanceable from any screen.
  useEffect(() => {
    document.title = isRunning
      ? `${mmss(timeLeft)} · ${phase === 'focus' ? 'Focus' : 'Break'} — ${BASE_TITLE}`
      : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [isRunning, timeLeft, phase]);
}
