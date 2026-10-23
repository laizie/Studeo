import { describe, it, expect } from 'vitest';
import {
  createCandle, advanceCandle, waxAccountedFor, isLit, isBurntOut, elapsedMs,
  CANDLE_HEIGHT, STEP_MS, type CandleState,
} from '../candleSim';

const MIN = 60_000;

/** Run a whole session plus a little slack so the last drips can land. */
function burnFully(seed: number, durationMs = 25 * MIN): CandleState {
  return advanceCandle(createCandle(seed, durationMs), durationMs / 1000 + 120);
}

describe('createCandle', () => {
  it('starts as a full, lit column with nothing spilled', () => {
    const c = createCandle(1, 25 * MIN);
    expect(c.column).toBe(CANDLE_HEIGHT);
    expect(isLit(c)).toBe(true);
    expect(c.base.every((h) => h === 0)).toBe(true);
  });

  it('refuses a session with no length', () => {
    expect(() => createCandle(1, 0)).toThrow();
  });
});

describe('timing — the flame lasts exactly the session', () => {
  it.each([1, 25, 52, 90])('is still lit one step before a %i-minute session ends, out right at it', (mins) => {
    const durationMs = mins * MIN;
    const almost = advanceCandle(createCandle(7, durationMs), (durationMs - STEP_MS) / 1000);
    expect(isLit(almost)).toBe(true);
    const done = advanceCandle(almost, STEP_MS / 1000);
    expect(isLit(done)).toBe(false);
  });

  it('is about half gone at the halfway point', () => {
    const c = advanceCandle(createCandle(3, 30 * MIN), 15 * 60);
    expect(c.column).toBeCloseTo(CANDLE_HEIGHT / 2, 5);
  });
});

describe('conservation — wax only ever moves', () => {
  it.each([1, 42, 9001, 123456789])('accounts for every bit of wax throughout a burn (seed %i)', (seed) => {
    let c = createCandle(seed, 10 * MIN);
    for (let t = 0; t < 11 * 60; t += 30) {
      c = advanceCandle(c, 30);
      expect(waxAccountedFor(c)).toBeCloseTo(c.totalWax, 9);
    }
  });

  it('ends with nothing in the air: all wax burned, on the base, or nowhere', () => {
    const c = burnFully(5);
    expect(isBurntOut(c)).toBe(true);
    expect(c.column).toBe(0);
    expect(c.pool).toBe(0);
    expect(c.drips).toHaveLength(0);
    expect(c.beads).toHaveLength(0); // every side bead melted back as the flame passed it
    expect(c.base.some((h) => h > 0)).toBe(true);
  });
});

describe('determinism — same seed, same candle', () => {
  it('lands on the same candle however the time is chopped up', () => {
    const start = createCandle(11, 5 * MIN);
    const once  = advanceCandle(start, 200);

    // 200s again, as uneven frames that rarely line up with a step boundary.
    const slices = [0.016, 0.017, 0.4, 1.3, 0.033, 0.234];
    let chopped = start;
    let ms = 0;
    for (let i = 0; ms < 200_000; i++) {
      const slice = Math.min(slices[i % slices.length], (200_000 - ms) / 1000);
      chopped = advanceCandle(chopped, slice);
      ms += Math.round(slice * 1000);
    }

    expect(elapsedMs(chopped)).toBe(elapsedMs(once));
    expect(chopped).toEqual(once);
  });

  it('rebuilds the same final shape from the same seed', () => {
    expect(burnFully(77).base).toEqual(burnFully(77).base);
  });

  it('gives a different shape for a different seed', () => {
    expect(burnFully(77).base).not.toEqual(burnFully(78).base);
  });

  it('never changes the state it was given', () => {
    const start = createCandle(2, 5 * MIN);
    const snapshot = JSON.stringify(start);
    advanceCandle(start, 120);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('time after the end', () => {
  it('stops changing once burnt out', () => {
    const done  = burnFully(9, 2 * MIN);
    const later = advanceCandle(done, 3600);
    expect(later.base).toEqual(done.base);
    expect(later.stepCount).toBe(done.stepCount);
  });
});
