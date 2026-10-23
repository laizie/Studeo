import { describe, it, expect } from 'vitest';
import {
  lightCandle, candleStatus, isCandleActive, addCandleEvent, followCandle, candleAt,
  parseCandleRecord, type CandleRecord, type LiveCandle,
} from '../candleSession';
import { STUB_HEIGHT, CANDLE_HEIGHT } from '../candleSim';

const MIN = 60_000;
const T0 = 1_800_000_000_000; // an arbitrary wall-clock start

describe('candleStatus', () => {
  it('is lit from the moment it is lit until the duration has burned', () => {
    const r = lightCandle(1, 25 * MIN, T0);
    expect(candleStatus(r, T0)).toBe('lit');
    expect(candleStatus(r, T0 + 25 * MIN - 1)).toBe('lit');
    expect(candleStatus(r, T0 + 25 * MIN)).toBe('finished');
  });

  it('does not count paused time toward the burn', () => {
    let r = lightCandle(1, 25 * MIN, T0);
    r = addCandleEvent(r, 'pause', T0 + 10 * MIN);
    expect(candleStatus(r, T0 + 60 * MIN)).toBe('paused');
    r = addCandleEvent(r, 'resume', T0 + 60 * MIN);
    expect(candleStatus(r, T0 + 74 * MIN)).toBe('lit');
    expect(candleStatus(r, T0 + 75 * MIN)).toBe('finished');
  });

  it('stays abandoned once abandoned', () => {
    const r = addCandleEvent(lightCandle(1, 25 * MIN, T0), 'abandon', T0 + MIN);
    expect(candleStatus(r, T0 + 999 * MIN)).toBe('abandoned');
    expect(isCandleActive(r, T0 + 2 * MIN)).toBe(false);
  });
});

describe('addCandleEvent', () => {
  it('ignores events that make no sense right now', () => {
    const lit = lightCandle(1, 25 * MIN, T0);
    expect(addCandleEvent(lit, 'resume', T0 + MIN)).toBe(lit);

    const paused = addCandleEvent(lit, 'pause', T0 + MIN);
    expect(addCandleEvent(paused, 'pause', T0 + 2 * MIN)).toBe(paused);

    const done = lightCandle(1, MIN, T0);
    expect(addCandleEvent(done, 'abandon', T0 + 2 * MIN)).toBe(done);
    expect(addCandleEvent(done, 'pause', T0 + 2 * MIN)).toBe(done);
  });

  it('keeps events in order even if the clock steps backwards', () => {
    let r = addCandleEvent(lightCandle(1, 25 * MIN, T0), 'pause', T0 + 5 * MIN);
    r = addCandleEvent(r, 'resume', T0 + 4 * MIN);
    expect(r.events[1].at).toBe(T0 + 5 * MIN);
  });
});

/** A session with a pause in it, as the timer would record it. */
function sessionWithPause(): CandleRecord {
  let r = lightCandle(42, 10 * MIN, T0);
  r = addCandleEvent(r, 'pause', T0 + 3 * MIN + 137);
  r = addCandleEvent(r, 'resume', T0 + 9 * MIN + 801);
  return r;
}

describe('followCandle — restarts are seamless', () => {
  it('lands on exactly the candle a full replay builds, however the frames fall', () => {
    const r = sessionWithPause();
    const end = T0 + 17 * MIN;
    let live: LiveCandle | null = null;
    // Uneven frames, like a real display loop that sometimes stalls.
    const frames = [16, 17, 33, 16, 250, 16, 1000, 16, 5000];
    for (let now = T0, i = 0; now < end; i++) {
      now = Math.min(end, now + frames[i % frames.length]);
      live = followCandle(live, r, now);
    }
    expect(live?.state).toEqual(candleAt(r, end));
  });

  it('picks up an event added while it was following', () => {
    let r = lightCandle(7, 10 * MIN, T0);
    let live = followCandle(null, r, T0 + 2 * MIN);
    r = addCandleEvent(r, 'pause', T0 + 2 * MIN + 500);
    live = followCandle(live, r, T0 + 4 * MIN);
    expect(live.state.flame).toBe('paused');
    expect(live.state).toEqual(candleAt(r, T0 + 4 * MIN));
  });

  it('rebuilds when handed a different candle', () => {
    const a = followCandle(null, lightCandle(1, 10 * MIN, T0), T0 + MIN);
    const b = lightCandle(2, 10 * MIN, T0 + 5 * MIN);
    expect(followCandle(a, b, T0 + 6 * MIN).state).toEqual(candleAt(b, T0 + 6 * MIN));
  });

  it('burns down to its stub if the block ended while the app was closed', () => {
    const c = candleAt(lightCandle(3, 25 * MIN, T0), T0 + 3 * 60 * MIN);
    expect(c.flame).toBe('finished');
    expect(c.column).toBe(STUB_HEIGHT);
  });

  it('finishes late by exactly the time it spent paused', () => {
    const r = sessionWithPause(); // paused ~6.5 minutes
    const pausedMs = r.events[1].at - r.events[0].at;
    expect(candleAt(r, T0 + 10 * MIN + pausedMs - 1000).flame).toBe('lit');
    expect(candleAt(r, T0 + 10 * MIN + pausedMs + 300).flame).toBe('finished');
  });

  it('is left standing when abandoned', () => {
    const r = addCandleEvent(lightCandle(9, 25 * MIN, T0), 'abandon', T0 + 5 * MIN);
    const c = candleAt(r, T0 + 60 * MIN);
    expect(c.flame).toBe('abandoned');
    expect(c.column).toBeGreaterThan(CANDLE_HEIGHT * 0.75);
  });

  it('waits to apply an event stamped in the future', () => {
    const r = addCandleEvent(lightCandle(5, 10 * MIN, T0), 'pause', T0 + 5 * MIN);
    expect(followCandle(null, r, T0 + 2 * MIN).state.flame).toBe('lit');
  });
});

describe('parseCandleRecord', () => {
  it('round-trips a saved record', () => {
    const r = sessionWithPause();
    expect(parseCandleRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it.each([
    ['nothing', null],
    ['a string', 'candle'],
    ['no seed', { durationMs: 1, litAt: T0, events: [] }],
    ['zero duration', { seed: 1, durationMs: 0, litAt: T0, events: [] }],
    ['an unknown event', { seed: 1, durationMs: 1, litAt: T0, events: [{ kind: 'explode', at: T0 }] }],
    ['events out of order', { seed: 1, durationMs: 1, litAt: T0, events: [{ kind: 'pause', at: T0 + 5 }, { kind: 'resume', at: T0 + 1 }] }],
    ['an event before it was lit', { seed: 1, durationMs: 1, litAt: T0, events: [{ kind: 'pause', at: T0 - 1 }] }],
  ])('refuses %s', (_label, raw) => {
    expect(parseCandleRecord(raw)).toBeNull();
  });
});
