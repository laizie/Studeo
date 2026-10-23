// A candle that burns for exactly one focus session — simulated, not animated.
//
// An animation would be a fixed movie played faster or slower. This is the opposite:
// the module holds the candle's *state* (how much wax is left, the melt pool, drips in
// flight, the hardened wax at the base) and a set of *rules* that move that state
// forward a small step at a time. The renderer just draws whatever the state says.
// Randomness enters at a handful of choices — where the rim gives way, how fast a drip
// cools, how far it spreads when it lands — and because every drip lands on the wax of
// the drips before it, two sessions drift apart fast. No two candles end the same.
//
// Three properties the tests hold this to:
//
//  1. **Exact timing.** The column melts at `totalWax / duration`, so the flame goes out
//     at the session's end — the burn rate comes from the user's focus time.
//  2. **Conservation.** Wax is never created or lost, only moved: column + pool + drips
//     in flight + beads on the side + wax on the base + what the flame burned always
//     equals what we started with. It's the check that catches most physics bugs.
//  3. **Determinism.** "Random" numbers come from a seeded generator whose state lives
//     *inside* CandleState. Same seed + same elapsed time = the same candle, however
//     the time was chopped up. That's what lets the app rebuild a candle after a
//     restart, or catch up after the window was hidden, by just re-running the steps.
//
// Units: the scene is a 2D front view. Lengths are "candle widths" (the column is 1
// wide, centred on x = 0, standing on y = 0). Wax is measured as area in those units,
// so a column of height h holds h of wax.

/** Sim time per step, in ms. An integer so chopped-up time adds up exactly (see `advanceCandle`). */
export const STEP_MS = 250;
const DT = STEP_MS / 1000;

export const CANDLE_HEIGHT = 4;
const CANDLE_HALF_WIDTH = 0.5;

/** The base heightmap spans this far either side of centre. */
export const BASE_HALF_WIDTH = 1.5;
export const BASE_COLS = 120;
export const BASE_DX = (BASE_HALF_WIDTH * 2) / BASE_COLS;

/** The rim is split into this many notches across the top; drips spill from the lowest. */
export const RIM_NOTCHES = 16;

/** Roughly how much liquid the pool holds before it spills. */
const POOL_CAPACITY = 0.015;

/** A drip still running, as liquid. */
export interface Drip {
  x: number;
  y: number;
  mass: number;
  /** 1 = just left the pool, 0 = solid. Drives speed and how far it spreads on landing. */
  temp: number;
  /** Per-drip cooling rate, rolled once: some drips are runners, some stall at once. */
  coolRate: number;
  /** Where it set off, so a frozen drip can be drawn as a streak from here. */
  x0: number;
  y0: number;
}

/** A drip that hardened on the side of the column before reaching the base. */
export interface Bead {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mass: number;
}

export interface CandleState {
  seed: number;
  /** The generator's internal state — part of the candle, so cloning it clones the "future". */
  rng: number;
  durationMs: number;
  /** Whole steps taken. Elapsed time is stepCount × STEP_MS — integers, so no float drift. */
  stepCount: number;
  /** Time handed to advanceCandle that didn't add up to a whole step yet. */
  carryMs: number;

  totalWax: number;
  /** Solid wax left in the standing column — also its height, since the column is 1 wide. */
  column: number;
  /** Liquid wax sitting on top of the column. */
  pool: number;
  /** The pool level at which the next spill happens; rerolled after every spill. */
  spillAt: number;
  /** Wax the flame consumed. Gone from the scene, but still counted. */
  burned: number;
  /** This session's share of melt the flame burns (the rest pools and drips). */
  burnShare: number;

  /** 0..1 per notch. Lower = weaker; each spill wears its notch down into a channel. */
  rim: number[];
  drips: Drip[];
  beads: Bead[];
  /** Height of hardened wax at each base column, left to right. */
  base: number[];
}

// ── Seeded random ─────────────────────────────────────────────────────────────────
// mulberry32: a tiny, well-known 32-bit generator. Not cryptographic — it doesn't need
// to be — but fast, evenly spread, and fully described by one integer, which we keep in
// the state. Math.random() can't do this: you can't save or rewind it.

function nextRandom(s: CandleState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function between(s: CandleState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextRandom(s);
}

// ── Construction ──────────────────────────────────────────────────────────────────

export function createCandle(seed: number, durationMs: number): CandleState {
  if (!(durationMs > 0)) throw new Error('A candle needs a positive duration');
  const s: CandleState = {
    seed,
    rng: seed | 0,
    durationMs,
    stepCount: 0,
    carryMs: 0,
    totalWax: CANDLE_HEIGHT,
    column: CANDLE_HEIGHT,
    pool: 0,
    spillAt: POOL_CAPACITY,
    burned: 0,
    burnShare: 0,
    rim: [],
    drips: [],
    beads: [],
    base: new Array<number>(BASE_COLS).fill(0),
  };
  s.burnShare = between(s, 0.7, 0.85);
  s.spillAt = POOL_CAPACITY * between(s, 0.8, 1.6);
  for (let i = 0; i < RIM_NOTCHES; i++) s.rim.push(between(s, 0.3, 0.7));
  return s;
}

/** A deep-enough copy that stepping the copy never touches the original. */
function cloneCandle(s: CandleState): CandleState {
  return {
    ...s,
    rim: [...s.rim],
    drips: s.drips.map((d) => ({ ...d })),
    beads: s.beads.map((b) => ({ ...b })),
    base: [...s.base],
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────────

export function elapsedMs(s: CandleState): number {
  return s.stepCount * STEP_MS + s.carryMs;
}

export function isLit(s: CandleState): boolean {
  return s.column > 0;
}

/** Flame out, nothing left moving: the candle's final shape. */
export function isBurntOut(s: CandleState): boolean {
  return !isLit(s) && s.pool === 0 && s.drips.length === 0;
}

/** Every bit of wax, wherever it is now. Should always equal `totalWax`. */
export function waxAccountedFor(s: CandleState): number {
  const inDrips = s.drips.reduce((sum, d) => sum + d.mass, 0);
  const inBeads = s.beads.reduce((sum, b) => sum + b.mass, 0);
  const onBase  = s.base.reduce((sum, h) => sum + h, 0) * BASE_DX;
  return s.column + s.pool + s.burned + inDrips + inBeads + onBase;
}

export function baseColumnAt(x: number): number {
  const i = Math.floor((x + BASE_HALF_WIDTH) / BASE_DX);
  return Math.min(BASE_COLS - 1, Math.max(0, i));
}

export function notchX(i: number): number {
  return -CANDLE_HALF_WIDTH + ((i + 0.5) / RIM_NOTCHES) * CANDLE_HALF_WIDTH * 2;
}

// ── Time ──────────────────────────────────────────────────────────────────────────

/**
 * Move the candle forward by `seconds` of sim time. Returns a new state; the input is
 * left alone, so React can hold the old one and compare.
 *
 * The rules always run in fixed STEP_MS steps, however much time is handed in —
 * leftovers wait in `carryMs` for the next call. That's the "fixed timestep" idea from
 * games: the physics never depends on frame rate, so advancing 10s at once lands on the
 * same candle as advancing 3s then 7s, or 600 frames of 1/60s. A hidden window that
 * comes back after ten minutes just calls this once with 600 and catches up.
 */
export function advanceCandle(prev: CandleState, seconds: number): CandleState {
  const s = cloneCandle(prev);
  s.carryMs += Math.max(0, Math.round(seconds * 1000));
  while (s.carryMs >= STEP_MS) {
    s.carryMs -= STEP_MS;
    if (isBurntOut(s)) continue; // nothing left to simulate; just let time pass
    step(s);
  }
  return s;
}

/** One fixed step of the rules. Mutates `s` — only ever called on a private clone. */
function step(s: CandleState): void {
  s.stepCount++;
  melt(s);
  remeltBeads(s);
  spill(s);
  moveDrips(s);
  relaxRim(s);
}

// ── The rules ─────────────────────────────────────────────────────────────────────

/** The flame melts the column at a constant rate; most of it burns, the rest pools. */
function melt(s: CandleState): void {
  if (!isLit(s)) return;
  const rate = s.totalWax / (s.durationMs / 1000);
  // On the final step, take whatever's left so the flame goes out on the dot instead of
  // a float's width before or after it.
  const lastStep = s.stepCount * STEP_MS >= s.durationMs;
  const melted = lastStep ? s.column : Math.min(s.column, rate * DT);
  s.column -= melted;
  if (s.column < 1e-12) s.column = 0;

  // The flame's appetite wanders a little step to step, so drips come in fits and starts.
  const share = Math.min(0.97, Math.max(0.4, s.burnShare + between(s, -0.15, 0.15)));
  s.burned += melted * share;
  s.pool   += melted * (1 - share);
}

/** As the column burns down past a hardened drip, that wax melts back into the pool. */
function remeltBeads(s: CandleState): void {
  const keep: Bead[] = [];
  for (const b of s.beads) {
    if (s.column <= b.y0) s.pool += b.mass;
    else keep.push(b);
  }
  s.beads = keep;
}

/**
 * When the pool tops out, it gives way at the weakest notch (plus a little luck). The
 * notch erodes as it does, so it's likelier to be the weak spot next time — that's how
 * real candles carve channels, and here it falls out of one line rather than a script.
 */
function spill(s: CandleState): void {
  // Once the flame's out the pool can't stay up there: it all goes, now.
  const mustDrain = !isLit(s) && s.pool > 0;
  if (!mustDrain && s.pool < s.spillAt) return;

  let notch = 0;
  let weakest = Infinity;
  for (let i = 0; i < RIM_NOTCHES; i++) {
    const score = s.rim[i] + between(s, 0, 0.5);
    if (score < weakest) { weakest = score; notch = i; }
  }
  // Wear is gentle and floored, and relaxRim heals it between spills — without that
  // push-back one notch wins every spill and the whole candle drips from one spot.
  s.rim[notch] = Math.max(0.15, s.rim[notch] - 0.08);

  const mass = mustDrain ? s.pool : s.pool * between(s, 0.5, 0.9);
  s.pool -= mass;
  if (s.pool < 1e-12) s.pool = 0;
  s.spillAt = POOL_CAPACITY * between(s, 0.8, 1.6);

  const x = notchX(notch);
  s.drips.push({
    x, y: s.column, x0: x, y0: s.column,
    mass,
    temp: 1,
    coolRate: between(s, 0.1, 0.28),
  });
}

/**
 * Drips run down while warm, slowing as they cool. Bigger drips hold heat longer and
 * run faster. One that cools on the column's side hardens there as a bead; one that
 * reaches the base lands on whatever wax is already there.
 */
function moveDrips(s: CandleState): void {
  const still: Drip[] = [];
  for (const d of s.drips) {
    const size = Math.sqrt(d.mass / 0.01);
    d.temp -= (d.coolRate / size) * DT;
    d.y -= 0.5 * Math.max(0, d.temp) * size * DT;
    d.x += between(s, -0.012, 0.012);
    d.x = Math.min(CANDLE_HALF_WIDTH, Math.max(-CANDLE_HALF_WIDTH, d.x));

    const floor = s.base[baseColumnAt(d.x)];
    if (d.y <= floor) {
      depositOnBase(s, d.x, d.mass, Math.max(0, d.temp));
    } else if (d.temp <= 0) {
      s.beads.push({ x0: d.x0, y0: d.y0, x1: d.x, y1: d.y, mass: d.mass });
    } else {
      still.push(d);
    }
  }
  s.drips = still;
}

/** A landing drip is split into this many parcels, each finding its own way down. */
const PARCELS_PER_DRIP = 6;

/**
 * Steepest slope (height change per unit across) that wax can rest on before it slides.
 * Hot wax barely holds on; nearly-set wax stacks up steep. This is the "angle of
 * repose" idea from sand piles, and it's what stops a clump from becoming a needle.
 */
const REPOSE_HOT  = 0.25;
const REPOSE_COLD = 1.6;

/**
 * A drip lands at `x` and flows downhill across the wax already there before it sets.
 *
 * The drip is split into a few parcels, laid down one after another. Each parcel starts
 * where the drip hit (nudged outward — wax running off a candle keeps some sideways
 * momentum) and keeps rolling to its lower neighbour while the slope is steeper than
 * it can rest on and it still has heat to move. Then it sets as a small bump.
 *
 * Because each parcel feels the slope the earlier ones left, wax slides off old clumps
 * and fills the hollows beside them, building ledges and tongues — layered and
 * lopsided, and different every time, since every drip lands on a different surface.
 */
function depositOnBase(s: CandleState, x: number, mass: number, temp: number): void {
  const outward = Math.sign(x || between(s, -1, 1));
  const parcel  = mass / PARCELS_PER_DRIP;

  for (let p = 0; p < PARCELS_PER_DRIP; p++) {
    let i = baseColumnAt(x + outward * temp * between(s, 0.05, 0.4) + between(s, -0.04, 0.04));
    let heat = temp;

    // How far it can still travel, in cells. Even cold wax gets a nudge or two.
    let moves = 2 + Math.round(heat * between(s, 15, 40));
    while (moves-- > 0) {
      const here  = s.base[i];
      const left  = i > 0             ? s.base[i - 1] : Infinity;
      const right = i < BASE_COLS - 1 ? s.base[i + 1] : Infinity;
      const lowest = Math.min(left, right);

      const repose = REPOSE_HOT + (REPOSE_COLD - REPOSE_HOT) * (1 - heat);
      if ((here - lowest) / BASE_DX <= repose) break; // gentle enough to rest here

      if (left < right)      i--;
      else if (right < left) i++;
      else                   i += nextRandom(s) < 0.5 ? -1 : 1;
      heat = Math.max(0, heat - 0.04);
    }

    spreadBump(s, i, parcel, 0.03 + heat * 0.05);
  }
}

/**
 * Lay `mass` down as a small bell-shaped bump centred on cell `centre`. The weights are
 * normalised over the cells that exist, so a bump at the edge is squashed, never
 * clipped — every bit of mass lands somewhere, which is what keeps conservation exact.
 */
function spreadBump(s: CandleState, centre: number, mass: number, sigma: number): void {
  const reach = Math.ceil((sigma * 3) / BASE_DX);
  const lo = Math.max(0, centre - reach);
  const hi = Math.min(BASE_COLS - 1, centre + reach);

  const weights: number[] = [];
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const w = Math.exp(-(((i - centre) * BASE_DX) ** 2) / (2 * sigma * sigma));
    weights.push(w);
    total += w;
  }
  for (let i = lo; i <= hi; i++) {
    s.base[i] += (mass * weights[i - lo]) / total / BASE_DX;
  }
}

/** The rim slowly re-forms as the top melts down, so old channels fade unless reused. */
function relaxRim(s: CandleState): void {
  for (let i = 0; i < RIM_NOTCHES; i++) {
    s.rim[i] += (0.5 - s.rim[i]) * 0.01 + between(s, -0.004, 0.004);
  }
}
