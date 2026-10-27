// Pomodoro facts that more than one *process* needs.
//
// These used to live in renderer/store/useTimerStore.ts, which was fine while the
// timer was one window's business. It stopped being fine when the pop-out arrived:
// that window must render a phase name, a phase color, and a clock WITHOUT importing
// the store — importing it would spin up a second, independent timer in that window,
// and the store's startup-recovery would log the same focus session twice.
//
// So the presentation constants and the pure formatter moved here (no Electron, no DOM,
// no store), and useTimerStore re-exports them so every existing importer is unchanged.

export type Phase = 'focus' | 'short_break' | 'long_break';

/**
 * How the timer runs. 'pomodoro' counts down through focus blocks and breaks (every
 * preset and Custom are this). 'open' is an open-ended study session: a stopwatch that
 * counts up — no phases, no breaks — until you finish it.
 */
export type TimerMode = 'pomodoro' | 'open';
export const TIMER_MODES: readonly TimerMode[] = ['pomodoro', 'open'];

/** What an open session is called wherever a phase name would go. */
export const OPEN_LABEL = 'Open study';

// Phase presentation lives here (not in a component) so the Study page, the
// sidebar chip, the pop-out, and the window title all agree on names and colors.
export const PHASE_LABELS: Record<Phase, string> = {
  focus:       'Focus',
  short_break: 'Break',
  long_break:  'Long break',
};

// Focus is the lamp: Lamplight Amber, the same word on every surface (the old
// muted red read as the danger family). Breaks stay in the green rest family;
// Focus Mode's GLOW map carries the brighter on-dark tones of the same hues.
export const PHASE_COLORS: Record<Phase, string> = {
  focus:       '#e2a53b',
  short_break: '#467a59',
  long_break:  '#34604a',
};

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

/**
 * Time studied, for a clock that counts up: "M:SS" under an hour, "H:MM:SS" after.
 * A countdown never runs past its block, so formatClock's "90:00" is fine there; an
 * open session can run for hours, where "187:12" would be harder to read than "3:07:12".
 */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * Everything the pop-out window needs to draw itself.
 *
 * Deliberately a snapshot, not a stream of ticks: `endsAt` is a wall-clock instant, so
 * the pop-out derives its own countdown from it locally and only hears from the owner
 * window when something REAL changes (phase, running/paused, a new end time). One IPC
 * message per transition instead of one per second.
 */
export interface MiniTimerState {
  /** Which kind of clock this is. In 'open' mode `timeLeft` holds the seconds studied
   *  so far (authoritative while paused) and `countsFrom` stands in for `endsAt`. */
  mode: TimerMode;
  phase: Phase;
  isRunning: boolean;
  /** Seconds left. Authoritative only while paused — see `endsAt`. */
  timeLeft: number;
  /** Wall-clock ms when the running phase ends; null when paused. */
  endsAt: number | null;
  /**
   * Open mode, running: the wall-clock ms the session would have started at had it
   * never been paused, so time studied = now − countsFrom. The count-up twin of
   * `endsAt` — one number any window can do the arithmetic on. Null otherwise.
   */
  countsFrom: number | null;
  /** The full length of this phase, so the pop-out can draw how far through it is
   *  without having to know the user's chosen durations. */
  totalSecs: number;
  /** Completed focus blocks in this cycle (0–3), for the progress dots. */
  focusCount: number;
}

/** How many focus blocks make a cycle — the pop-out draws this many dots. */
export const CYCLE_LENGTH = 4;

/** What the pop-out can ask the owner window to do. Timer verbs only. */
export type MiniTimerCommand = 'start' | 'pause' | 'skip';

/**
 * Seconds left right now, given a snapshot. While running the wall clock is the truth
 * (a snapshot can be seconds old, and background throttling can delay the next one);
 * while paused, `timeLeft` is.
 */
export function secondsLeft(state: MiniTimerState, now: number = Date.now()): number {
  if (state.isRunning && state.endsAt != null) {
    return Math.max(0, Math.round((state.endsAt - now) / 1000));
  }
  return Math.max(0, state.timeLeft);
}

/**
 * What the clock reads right now: seconds left on a countdown, or seconds studied so
 * far in an open session. Open time is floored — a stopwatch shows a second once it
 * has fully passed — where the countdown rounds (see msUntilClockChange).
 */
export function clockSeconds(state: MiniTimerState, now: number = Date.now()): number {
  if (state.mode !== 'open') return secondsLeft(state, now);
  if (state.isRunning && state.countsFrom != null) {
    return Math.max(0, Math.floor((now - state.countsFrom) / 1000));
  }
  return Math.max(0, state.timeLeft);
}

/** The clock's text, in the right format for its mode. */
export function clockText(state: MiniTimerState, now: number = Date.now()): string {
  const secs = clockSeconds(state, now);
  return state.mode === 'open' ? formatElapsed(secs) : formatClock(secs);
}

/**
 * How long until an open session's clock next ticks over, in ms (1–1000). Elapsed is
 * floor((now − countsFrom) / 1000), so it changes each time that difference crosses a
 * whole second — the count-up counterpart of msUntilClockChange, for the same reason:
 * every clock on the session flips at the same instant.
 */
export function msUntilElapsedChange(countsFrom: number, now: number = Date.now()): number {
  const into = (((now - countsFrom) % 1000) + 1000) % 1000;
  return 1000 - into;
}

/**
 * How long until the displayed clock next changes, in ms.
 *
 * A countdown flips when the ROUNDED remaining seconds change, which is on the
 * half-second boundaries of `endsAt` — not on whole seconds, and definitely not on
 * whichever arbitrary instant a `setInterval(1000)` happened to be started at. That
 * distinction is what makes two clocks on the same timer disagree: sample the same
 * `endsAt` on two different 1-second grids and they sit up to a full second apart,
 * one visibly "ahead" of the other, though neither is wrong about the time.
 *
 * Scheduling each update from this instead of from a fixed interval puts every clock's
 * flip on the timer's own boundary, so they change together. It also self-corrects:
 * the next delay is recomputed from the wall clock every time, so a late or throttled
 * fire is absorbed instead of being carried forward as permanent drift.
 *
 * The arithmetic: displayed = round(r / 1000) = floor((r + 500) / 1000), so the value
 * changes once (r + 500) crosses below a multiple of 1000 — one millisecond PAST the
 * boundary, not at it, because Math.round breaks the half upward. (24.5s still reads
 * as "25", 24.499s reads as "24".) A property test in __tests__/pomodoro.test.ts
 * checks that against Math.round directly for every offset, which is how the missing
 * millisecond was caught in the first place.
 *
 * Returns 0 once the phase is over (update now). Otherwise 1–1000, never 0, so a
 * caller that reschedules from it can't spin.
 */
export function msUntilClockChange(endsAt: number, now: number = Date.now()): number {
  const remaining = endsAt - now;
  if (remaining <= 0) return 0;
  return ((remaining + 500) % 1000) + 1;
}
