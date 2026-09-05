import { describe, it, expect } from 'vitest';
import {
  formatClock, secondsLeft, msUntilClockChange, PHASE_LABELS, PHASE_COLORS, type MiniTimerState,
} from '../pomodoro';

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

// Two clocks on one timer (the Study page and the pop-out) drifted a second apart
// because they sampled the same end time on different 1-second grids. This puts every
// clock's update on the timer's own boundary instead.
describe('msUntilClockChange', () => {
  const now = 1_700_000_000_000;
  const inMs = (ms: number) => msUntilClockChange(now + ms, now);

  it('waits for the moment the display actually flips', () => {
    // 25.000s left reads as "25:00" and keeps reading that until 24.5s is PAST —
    // Math.round breaks the half upward, so the flip is a millisecond after it.
    expect(inMs(25_000)).toBe(501);
    // 24.6s still reads as "25:00"; it's a tenth of a second from flipping.
    expect(inMs(24_600)).toBe(101);
    // 24.4s already reads as "24:59", so the next change is nearly a second out.
    expect(inMs(24_400)).toBe(901);
    // Sitting exactly on the boundary: still reading the old value, flips next ms.
    expect(inMs(24_500)).toBe(1);
  });

  it('always schedules within a second, and never zero (which would spin)', () => {
    for (let ms = 1; ms <= 3_000; ms++) {
      const d = inMs(ms);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(1000);
    }
  });

  it('says "now" once the phase is over', () => {
    expect(inMs(0)).toBe(0);
    expect(inMs(-5_000)).toBe(0);
  });

  // The property that matters, checked against Math.round itself: after waiting the
  // returned delay the displayed value really has changed — and one millisecond
  // earlier it had not. This is the test that caught the off-by-one above.
  it('lands exactly on the change, for every offset', () => {
    const shown = (msLeft: number) => Math.round(msLeft / 1000);
    for (let ms = 600; ms <= 3_000; ms++) {
      const delay = inMs(ms);
      expect(shown(ms - delay)).not.toBe(shown(ms));
      expect(shown(ms - delay + 1)).toBe(shown(ms));
    }
  });
});
