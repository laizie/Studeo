import { describe, it, expect } from 'vitest';
import {
  createCandle, advanceCandle, pauseCandle, resumeCandle, abandonCandle,
  waxAccountedFor, isLit, isSettled, elapsedMs,
  CANDLE_HEIGHT, STUB_HEIGHT, STEP_MS, type CandleState,
} from '../candleSim';

const MIN = 60_000;

/** Run a whole session plus enough slack for the last drips to land and the pool to set. */
function burnFully(seed: number, durationMs = 25 * MIN): CandleState {
  return advanceCandle(createCandle(seed, durationMs), durationMs / 1000 + 300);
}

/** Step through `seconds` one second at a time, recording when each gush began. */
function gushStarts(c: CandleState, seconds: number): { candle: CandleState; times: number[] } {
  const times: number[] = [];
  for (let t = 0; t < seconds; t++) {
    const before = c.gushes;
    c = advanceCandle(c, 1);
    if (c.gushes > before) times.push(t);
  }
  return { candle: c, times };
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
    expect(done.flame).toBe('finished');
  });

  it('is about half burned at the halfway point', () => {
    const c = advanceCandle(createCandle(3, 30 * MIN), 15 * 60);
    expect(c.column).toBeCloseTo(STUB_HEIGHT + (CANDLE_HEIGHT - STUB_HEIGHT) / 2, 5);
  });

  it('burns down to the stub, not to nothing', () => {
    expect(burnFully(5).column).toBe(STUB_HEIGHT);
  });
});

describe('conservation — wax only ever moves', () => {
  it.each([1, 42, 9001, 123456789])('accounts for every bit of wax throughout a burn (seed %i)', (seed) => {
    let c = createCandle(seed, 10 * MIN);
    for (let t = 0; t < 12 * 60; t += 30) {
      c = advanceCandle(c, 30);
      expect(waxAccountedFor(c)).toBeCloseTo(c.totalWax, 9);
    }
  });

  it('still adds up across pauses, a relight, and an abandon', () => {
    let c = createCandle(8, 10 * MIN);
    c = advanceCandle(c, 200);
    c = pauseCandle(c);
    c = advanceCandle(c, 400);
    c = resumeCandle(c);
    c = advanceCandle(c, 150);
    c = abandonCandle(c);
    c = advanceCandle(c, 600);
    expect(waxAccountedFor(c)).toBeCloseTo(c.totalWax, 9);
  });
});

describe('rhythm — calm stretches, occasional gushes', () => {
  it.each([1, 2, 3])('gushes only a handful of times in a 25-minute session (seed %i)', (seed) => {
    const { times } = gushStarts(createCandle(seed, 25 * MIN), 25 * 60);
    expect(times.length).toBeGreaterThanOrEqual(5);
    expect(times.length).toBeLessThanOrEqual(25);
  });

  it('leaves at least a minute between most gushes', () => {
    const { times } = gushStarts(createCandle(4, 25 * MIN), 25 * 60);
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length / 2)]).toBeGreaterThanOrEqual(60);
  });
});

describe('finishing — a stub sitting in its own puddle', () => {
  it('settles with nothing still moving', () => {
    const c = burnFully(5);
    expect(isSettled(c)).toBe(true);
    expect(c.drips).toHaveLength(0);
    expect(c.gush).toBeNull();
    expect(c.base.some((h) => h > 0)).toBe(true);
  });

  it('never piles the puddle higher than the stub it surrounds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      expect(Math.max(...burnFully(seed * 7919).base)).toBeLessThan(STUB_HEIGHT);
    }
  });

  it('keeps only tears that ran low enough to sit on the stub', () => {
    const candles = [1, 2, 3, 4, 5, 6].map((seed) => burnFully(seed));
    expect(candles.some((c) => c.tears.length > 0)).toBe(true);
    for (const c of candles) {
      for (const t of c.tears) expect(t.y0).toBeLessThanOrEqual(STUB_HEIGHT + 1e-9);
    }
  });
});

describe('pausing — the flame goes out and the wax sets', () => {
  it('melts nothing while paused, and the pool hardens', () => {
    let c = pauseCandle(advanceCandle(createCandle(7, 10 * MIN), 120));
    const column = c.column;
    c = advanceCandle(c, 300);
    expect(c.flame).toBe('paused');
    expect(c.column).toBe(column);
    expect(c.poolHeat).toBe(0);
  });

  it('starts no new gushes while paused', () => {
    let c = pauseCandle(advanceCandle(createCandle(7, 10 * MIN), 120));
    const before = c.gushes;
    c = advanceCandle(c, 1800);
    expect(c.gushes).toBe(before);
  });

  it('finishes after the full focus time, however long the pause', () => {
    let c = advanceCandle(createCandle(7, 10 * MIN), 4 * 60);
    c = pauseCandle(c);
    c = advanceCandle(c, 45 * 60);
    c = resumeCandle(c);
    c = advanceCandle(c, (6 * MIN - STEP_MS) / 1000);
    expect(isLit(c)).toBe(true);
    c = advanceCandle(c, STEP_MS / 1000);
    expect(c.flame).toBe('finished');
  });

  it('records a seam in the clump at each pause once there is wax to mark', () => {
    let c = advanceCandle(createCandle(7, 10 * MIN), 9 * 60);
    expect(c.base.some((h) => h > 0)).toBe(true);
    c = pauseCandle(c);
    expect(c.seams).toHaveLength(1);
    expect(c.seams[0]).toEqual(c.base);
  });

  it('ignores a pause or relight that does not apply', () => {
    const lit = createCandle(1, MIN);
    expect(resumeCandle(lit)).toBe(lit);
    const paused = pauseCandle(lit);
    expect(pauseCandle(paused)).toBe(paused);
  });
});

describe('abandoning — the candle is left standing', () => {
  it('snuffs the flame for good and keeps the height it had reached', () => {
    let c = advanceCandle(createCandle(9, 25 * MIN), 5 * 60);
    const column = c.column;
    c = abandonCandle(c);
    c = advanceCandle(c, 600);
    expect(c.flame).toBe('abandoned');
    expect(c.column).toBe(column);
    expect(c.column).toBeGreaterThan(3);
    expect(isSettled(c)).toBe(true);
  });

  it('cannot be relit', () => {
    const c = abandonCandle(createCandle(9, 25 * MIN));
    expect(resumeCandle(c)).toBe(c);
  });

  it('works from a pause too', () => {
    const c = abandonCandle(pauseCandle(createCandle(9, 25 * MIN)));
    expect(c.flame).toBe('abandoned');
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

  it('replays the same pauses into the same candle', () => {
    const run = () => {
      let c = advanceCandle(createCandle(12, 10 * MIN), 180);
      c = advanceCandle(pauseCandle(c), 240);
      c = advanceCandle(resumeCandle(c), 500);
      return c;
    };
    expect(run()).toEqual(run());
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
    pauseCandle(start);
    abandonCandle(start);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('time after the end', () => {
  it('stops changing once settled', () => {
    const done  = burnFully(9, 2 * MIN);
    const later = advanceCandle(done, 3600);
    expect(later.base).toEqual(done.base);
    expect(later.tears).toEqual(done.tears);
    expect(later.rng).toBe(done.rng);
  });
});
