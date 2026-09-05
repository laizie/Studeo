import { describe, it, expect } from 'vitest';
import { formatClock, secondsLeft, PHASE_LABELS, PHASE_COLORS, type MiniTimerState } from '../pomodoro';

function state(over: Partial<MiniTimerState> = {}): MiniTimerState {
  return {
    phase: 'focus',
    isRunning: false,
    timeLeft: 1500,
    endsAt: null,
    totalSecs: 1500,
    focusCount: 0,
    ...over,
  };
}

describe('formatClock', () => {
  it('pads both halves', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(1500)).toBe('25:00');
  });

  it('never shows a negative clock', () => {
    expect(formatClock(-30)).toBe('00:00');
  });

  it('keeps counting past an hour rather than wrapping', () => {
    expect(formatClock(5400)).toBe('90:00');
  });
});

// The pop-out window derives its own countdown from a snapshot, so this function is
// the whole reason one IPC message per phase can stand in for one per second.
describe('secondsLeft', () => {
  const now = 1_700_000_000_000;

  it('reads the wall clock while running, not the snapshot field', () => {
    // `timeLeft` is deliberately stale here — this is what a snapshot looks like a
    // few seconds after it was sent.
    const s = state({ isRunning: true, endsAt: now + 90_000, timeLeft: 1500 });
    expect(secondsLeft(s, now)).toBe(90);
  });

  it('clamps to zero once the end time has passed', () => {
    const s = state({ isRunning: true, endsAt: now - 5_000, timeLeft: 1500 });
    expect(secondsLeft(s, now)).toBe(0);
  });

  it('trusts timeLeft while paused (endsAt is null then)', () => {
    expect(secondsLeft(state({ isRunning: false, timeLeft: 742 }), now)).toBe(742);
  });

  it('falls back to timeLeft if a running snapshot somehow has no end time', () => {
    expect(secondsLeft(state({ isRunning: true, endsAt: null, timeLeft: 300 }), now)).toBe(300);
  });
});

describe('phase presentation', () => {
  it('names and colors every phase', () => {
    for (const phase of ['focus', 'short_break', 'long_break'] as const) {
      expect(PHASE_LABELS[phase]).toBeTruthy();
      expect(PHASE_COLORS[phase]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
