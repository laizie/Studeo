import { useEffect, useState } from 'react';

/**
 * Today's local midnight, as a value that actually changes when the day does.
 *
 * The problem it solves: `new Date()` inside a render is not reactive. Screens that
 * computed "today" at mount froze there, and this is a desktop app students leave open
 * for days — cross midnight and the Dashboard still showed yesterday. An assignment due
 * today read "Tomorrow", nothing moved into Overdue, and "Today's classes" listed the
 * wrong day. Anything that should change when wall-clock time crosses a boundary needs
 * a signal fired at that boundary; this is that signal.
 *
 * Ticks on the hour rather than only at midnight so hour-sensitive copy (the Dashboard's
 * "Good morning / afternoon / evening") refreshes too. Midnight is an hour boundary, so
 * one mechanism covers both.
 *
 * Also recomputes when the window is shown or focused. A `setTimeout` an hour out is not
 * reliable across a laptop sleeping — the same reason the reminder scheduler in main
 * polls instead of scheduling far-future timers. Waking to a stale date is exactly the
 * case this hook exists to prevent, so we don't trust the timer alone.
 *
 * Returns a stable reference while the day is unchanged, so `useMemo([today])` in callers
 * doesn't recompute on every render.
 */
export function useToday(): Date {
  const [today, setToday] = useState(startOfLocalDay);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    // Only swap the value when the DAY actually changed. The hourly tick fires 24 times
    // a day; without this guard each one would hand callers a new Date identity and
    // invalidate every useMemo keyed on it for nothing.
    const sync = () => {
      const next = startOfLocalDay();
      setToday(prev => (prev.getTime() === next.getTime() ? prev : next));
    };

    const scheduleNextHour = () => {
      const now = new Date();
      const nextHour = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0,
      );
      timer = setTimeout(() => {
        sync();
        scheduleNextHour();
      }, nextHour.getTime() - now.getTime());
    };
    scheduleNextHour();

    const onWake = () => sync();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, []);

  return today;
}

/**
 * The hour-sensitive companion: re-renders on the hour so time-of-day copy stays honest.
 * Separate from useToday() because most callers only care about the date and shouldn't
 * re-render 24 times a day for a greeting they don't show.
 */
export function useHourOfDay(): number {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => setHour(prev => {
      const next = new Date().getHours();
      return prev === next ? prev : next;
    });

    const scheduleNextHour = () => {
      const now = new Date();
      const nextHour = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0,
      );
      timer = setTimeout(() => { sync(); scheduleNextHour(); }, nextHour.getTime() - now.getTime());
    };
    scheduleNextHour();

    const onWake = () => sync();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, []);

  return hour;
}

function startOfLocalDay(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
