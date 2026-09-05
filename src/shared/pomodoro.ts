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
 * Everything the pop-out window needs to draw itself.
 *
 * Deliberately a snapshot, not a stream of ticks: `endsAt` is a wall-clock instant, so
 * the pop-out derives its own countdown from it locally and only hears from the owner
 * window when something REAL changes (phase, running/paused, a new end time). One IPC
 * message per transition instead of one per second.
 */
export interface MiniTimerState {
  phase: Phase;
  isRunning: boolean;
  /** Seconds left. Authoritative only while paused — see `endsAt`. */
  timeLeft: number;
  /** Wall-clock ms when the running phase ends; null when paused. */
  endsAt: number | null;
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
