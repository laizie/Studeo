import {
  createCandle, advanceCandle, pauseCandle, resumeCandle, abandonCandle,
  type CandleState,
} from './candleSim';

// One focus block's candle, as a record small enough to save.
//
// A candle's full state — every drip, tear and bump of the puddle — is hundreds of
// numbers and changes four times a second. Saving that would be wasteful and fragile.
// But the sim is deterministic: the same seed fed the same events at the same moments
// grows the same candle. So the record keeps only what *happened* — which candle (the
// seed), how long it should burn, when it was lit, and each pause, resume or abandon
// with its wall-clock time — and the candle itself is rebuilt by replaying those.
//
// That's the "event sourcing" idea: store the history, derive the state. It's what lets
// a candle that was burning when the app quit come back exactly as it would have been —
// still burning, or burnt down to its stub if the block ended while the app was closed.

export type CandleEventKind = 'pause' | 'resume' | 'abandon';

export interface CandleEvent {
  kind: CandleEventKind;
  /** Wall-clock ms (Date.now()). */
  at: number;
}

export interface CandleRecord {
  seed: number;
  /** How long the flame burns, in time actually lit. */
  durationMs: number;
  /** Wall-clock ms the candle was lit. */
  litAt: number;
  /** In time order. */
  events: CandleEvent[];
}

export type CandleStatus = 'lit' | 'paused' | 'finished' | 'abandoned';

export function lightCandle(seed: number, durationMs: number, now: number): CandleRecord {
  return { seed, durationMs, litAt: now, events: [] };
}

/**
 * Where the candle stands at `now`, worked out from the events alone — no simulation.
 * "Finished" is reached once the time spent lit adds up to the duration.
 */
export function candleStatus(r: CandleRecord, now: number): CandleStatus {
  let litMs = 0;
  let litSince: number | null = r.litAt;
  for (const e of r.events) {
    if (e.kind === 'abandon') return 'abandoned';
    if (e.kind === 'pause' && litSince !== null) {
      litMs += e.at - litSince;
      litSince = null;
    } else if (e.kind === 'resume' && litSince === null) {
      litSince = e.at;
    }
  }
  if (litSince !== null) litMs += Math.max(0, now - litSince);
  if (litMs >= r.durationMs) return 'finished';
  return litSince === null ? 'paused' : 'lit';
}

/** Is this the candle of a block that's still going (lit or paused)? */
export function isCandleActive(r: CandleRecord, now: number): boolean {
  const status = candleStatus(r, now);
  return status === 'lit' || status === 'paused';
}

/**
 * Add an event at `now` — if it makes sense right now. Pausing a candle that isn't lit,
 * or abandoning one that has already burnt down, hands back the same record unchanged,
 * so callers can fire events freely without checking first.
 */
export function addCandleEvent(r: CandleRecord, kind: CandleEventKind, now: number): CandleRecord {
  const status = candleStatus(r, now);
  const applies =
    (kind === 'pause'   && status === 'lit') ||
    (kind === 'resume'  && status === 'paused') ||
    (kind === 'abandon' && (status === 'lit' || status === 'paused'));
  if (!applies) return r;
  // Keep events in order even if the clock stepped backwards between two of them.
  const last = r.events.length ? r.events[r.events.length - 1].at : r.litAt;
  return { ...r, events: [...r.events, { kind, at: Math.max(now, last) }] };
}

/**
 * A candle being kept up to date with its record, frame by frame: the sim state, the
 * wall-clock moment it represents, and how many of the record's events it has applied.
 */
export interface LiveCandle {
  state: CandleState;
  at: number;
  applied: number;
  seed: number;
  litAt: number;
}

function applyEvent(state: CandleState, kind: CandleEventKind): CandleState {
  if (kind === 'pause')  return pauseCandle(state);
  if (kind === 'resume') return resumeCandle(state);
  return abandonCandle(state);
}

/**
 * Bring a live candle up to `now`: advance to each new event's moment, apply it, then
 * advance the rest of the way. Pass null (or a candle from a different record) to
 * rebuild from scratch — that's the replay after a restart.
 *
 * Doing it in pieces every frame lands on exactly the same candle as one big replay,
 * because the sim advances in fixed whole-millisecond steps however the time is split
 * (see advanceCandle). That equality is what makes a restart seamless, and the tests
 * hold it to it.
 */
export function followCandle(live: LiveCandle | null, r: CandleRecord, now: number): LiveCandle {
  const next = r.events[live?.applied ?? 0];
  const usable =
    live !== null &&
    live.seed === r.seed &&
    live.litAt === r.litAt &&
    live.applied <= r.events.length &&
    // An event stamped before the moment we've already drawn can't be slotted in;
    // start again from the record rather than show a candle that never existed.
    (next === undefined || next.at >= live.at);

  let state = usable ? live.state : createCandle(r.seed, r.durationMs);
  let at = usable ? live.at : r.litAt;
  let applied = usable ? live.applied : 0;

  while (applied < r.events.length && r.events[applied].at <= now) {
    const e = r.events[applied];
    if (e.at > at) {
      state = advanceCandle(state, (e.at - at) / 1000);
      at = e.at;
    }
    state = applyEvent(state, e.kind);
    applied++;
  }
  if (now > at) {
    state = advanceCandle(state, (now - at) / 1000);
    at = now;
  }
  return { state, at, applied, seed: r.seed, litAt: r.litAt };
}

/** The candle as it is at `now`, rebuilt from its record. */
export function candleAt(r: CandleRecord, now: number): CandleState {
  return followCandle(null, r, now).state;
}

/**
 * Check a record read back from storage. Anything malformed — a hand-edited file, a
 * format from another version — is refused rather than half-trusted.
 */
export function parseCandleRecord(raw: unknown): CandleRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!finite(r.seed) || !finite(r.durationMs) || r.durationMs <= 0 || !finite(r.litAt)) return null;
  if (!Array.isArray(r.events)) return null;

  const events: CandleEvent[] = [];
  let last = r.litAt;
  for (const item of r.events) {
    if (typeof item !== 'object' || item === null) return null;
    const e = item as Record<string, unknown>;
    if (e.kind !== 'pause' && e.kind !== 'resume' && e.kind !== 'abandon') return null;
    if (!finite(e.at) || e.at < last) return null;
    events.push({ kind: e.kind, at: e.at });
    last = e.at;
  }
  return { seed: r.seed, durationMs: r.durationMs, litAt: r.litAt, events };
}
