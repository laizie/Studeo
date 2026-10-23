// A candle that burns for exactly one focus session — simulated, not animated.
//
// An animation would be a fixed movie played faster or slower. This is the opposite:
// the module holds the candle's *state* (how much wax is left, the melt pool, drips in
// flight, tears frozen on the side, the hardened wax at the base) and a set of *rules*
// that move that state forward a small step at a time. The renderer just draws whatever
// the state says. Randomness enters at a handful of choices — where the rim gives way,
// how fast a drip cools, how far it spreads when it lands — and because every drip
// lands on the wax of the drips before it, two sessions drift apart fast.
//
// What a session looks like, start to finish: long calm stretches while the melt pool
// fills, broken now and then by a gush when the rim gives way. Small drips freeze on the
// side as tears; later drips run down over those tears and lengthen them; bigger ones
// reach the base and spread into a lopsided puddle. Pausing puts the flame out and lets
// the pool set; abandoning snuffs it for good and leaves the candle standing tall.
// Finishing burns it down to a short stub sitting in its own puddle.
//
// Three properties the tests hold this to:
//
//  1. **Exact timing.** The column melts at a rate set by the session's length, counted
//     in time *lit* — so the flame reaches the stub at the end of the focus time, and a
//     pause doesn't eat into the candle.
//  2. **Conservation.** Wax is never created or lost, only moved: column + pool + a gush
//     in progress + drips + tears + wax on the base + what the flame burned always equals
//     what we started with. It's the check that catches most physics bugs.
//  3. **Determinism.** "Random" numbers come from a seeded generator whose state lives
//     *inside* CandleState. Same seed + same events at the same times = the same candle,
//     however the time was chopped up. That's what lets the app rebuild a candle after
//     a restart, or catch up after the window was hidden, by just re-running the steps.
//
// Units: the scene is a 2D front view. Lengths are "candle widths" (the column is 1
// wide, centred on x = 0, standing on y = 0). Wax is measured as area in those units,
// so a column of height h holds h of wax.

/** Sim time per step, in ms. An integer so chopped-up time adds up exactly (see `advanceCandle`). */
export const STEP_MS = 250;
const DT = STEP_MS / 1000;

export const CANDLE_HEIGHT = 4;
/** What's left standing when a finished session's flame goes out: a short stump. */
export const STUB_HEIGHT = 0.6;
export const CANDLE_HALF_WIDTH = 0.5;

/** The base heightmap spans this far either side of centre. */
export const BASE_HALF_WIDTH = 1.5;
export const BASE_COLS = 120;
export const BASE_DX = (BASE_HALF_WIDTH * 2) / BASE_COLS;

/** The rim is split into this many notches across the top; gushes break through the weakest. */
export const RIM_NOTCHES = 16;

/**
 * Roughly how much liquid the pool holds before the rim gives way. Deep on purpose: a
 * deep pool means long quiet stretches between gushes rather than a constant patter.
 */
const POOL_CAPACITY = 0.075;

/** How close (in candle widths) a drip has to be to a tear to run along it. */
const TEAR_REACH = 0.05;

export type Flame = 'lit' | 'paused' | 'finished' | 'abandoned';

/** A drip still running, as liquid. */
export interface Drip {
  x: number;
  y: number;
  mass: number;
  /** 1 = just left the pool, 0 = solid. Drives speed and how far it spreads on landing. */
  temp: number;
  /** Per-drip cooling rate, rolled once: some drips are runners, some stall at once. */
  coolRate: number;
}

/** A tear: drip wax that hardened on the side of the column. Runs from (x0,y0) down to (x1,y1). */
export interface Tear {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mass: number;
}

/** A rim breach in progress: the pool pours out through one notch as a few drips in a row. */
export interface Gush {
  notch: number;
  /** Wax that has left the pool but not yet set off as a drip. */
  remaining: number;
  /** Steps until the next drip in this gush. */
  wait: number;
}

export interface CandleState {
  seed: number;
  /** The generator's internal state — part of the candle, so cloning it clones the "future". */
  rng: number;
  durationMs: number;
  /** Whole steps taken. Wall time is stepCount × STEP_MS — integers, so no float drift. */
  stepCount: number;
  /** Time handed to advanceCandle that didn't add up to a whole step yet. */
  carryMs: number;
  /** Time the flame has actually been lit. The burn runs on this, not the wall clock. */
  litMs: number;
  flame: Flame;

  totalWax: number;
  /** Solid wax left in the standing column — also its height, since the column is 1 wide. */
  column: number;
  /** Wax sitting in the cup at the top of the column. */
  pool: number;
  /** 1 = molten, 0 = set. With the flame out the pool hardens, and hard wax can't spill. */
  poolHeat: number;
  /** The pool level at which the rim next gives way; rerolled after every gush. */
  spillAt: number;
  /** Wax the flame consumed. Gone from the scene, but still counted. */
  burned: number;
  /** This candle's share of melt the flame burns (the rest pools and drips). */
  burnShare: number;
  /**
   * -1..1: which side this candle tends to drip on — a draught, a thinner wall. Rolled
   * once per candle; it's most of what gives each one its own lopsided character.
   */
  lean: number;

  /** 0..1 per notch. Lower = weaker; each gush wears its notch down into a channel. */
  rim: number[];
  gush: Gush | null;
  /** How many times the rim has given way. For the readout and the tests. */
  gushes: number;
  drips: Drip[];
  tears: Tear[];
  /** Height of hardened wax at each base column, left to right. */
  base: number[];
  /**
   * The base's surface at each pause. Later wax lands on top of a set surface, so the
   * renderer can draw these as faint lines inside the clump — a record of the breaks.
   */
  seams: number[][];
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
    litMs: 0,
    flame: 'lit',
    totalWax: CANDLE_HEIGHT,
    column: CANDLE_HEIGHT,
    pool: 0,
    poolHeat: 0,
    spillAt: POOL_CAPACITY,
    burned: 0,
    burnShare: 0,
    lean: 0,
    rim: [],
    gush: null,
    gushes: 0,
    drips: [],
    tears: [],
    base: new Array<number>(BASE_COLS).fill(0),
    seams: [],
  };
  // Narrow ranges on purpose: candles should differ the way two real candles from the
  // same box do — noticeably, not wildly.
  s.burnShare = between(s, 0.86, 0.92);
  s.lean      = between(s, -1, 1);
  s.spillAt   = POOL_CAPACITY * between(s, 0.7, 1.4);
  for (let i = 0; i < RIM_NOTCHES; i++) s.rim.push(rimRest(s, i) + between(s, -0.15, 0.15));
  return s;
}

/** A deep-enough copy that stepping the copy never touches the original. */
function cloneCandle(s: CandleState): CandleState {
  return {
    ...s,
    rim: [...s.rim],
    gush: s.gush && { ...s.gush },
    drips: s.drips.map((d) => ({ ...d })),
    tears: s.tears.map((t) => ({ ...t })),
    base: [...s.base],
    seams: s.seams.map((seam) => [...seam]),
  };
}

// ── Session events ────────────────────────────────────────────────────────────────
// The timer calls these. Each returns a new state and leaves the old one alone; a call
// that doesn't apply (pausing a candle that's already out) hands back the same object.

/** Put the flame out for a pause. The pool starts to set; nothing more melts. */
export function pauseCandle(prev: CandleState): CandleState {
  if (prev.flame !== 'lit') return prev;
  const s = cloneCandle(prev);
  s.flame = 'paused';
  if (s.base.some((h) => h > 0)) s.seams.push([...s.base]);
  return s;
}

/** Relight after a pause. The pool remelts and the burn picks up where it left off. */
export function resumeCandle(prev: CandleState): CandleState {
  if (prev.flame !== 'paused') return prev;
  const s = cloneCandle(prev);
  s.flame = 'lit';
  return s;
}

/** The session was given up: snuff the flame for good and leave the candle standing. */
export function abandonCandle(prev: CandleState): CandleState {
  if (prev.flame !== 'lit' && prev.flame !== 'paused') return prev;
  const s = cloneCandle(prev);
  s.flame = 'abandoned';
  return s;
}

// ── Queries ───────────────────────────────────────────────────────────────────────

export function elapsedMs(s: CandleState): number {
  return s.stepCount * STEP_MS + s.carryMs;
}

export function isLit(s: CandleState): boolean {
  return s.flame === 'lit';
}

/** Flame out and nothing can change until someone relights it. */
function isQuiet(s: CandleState): boolean {
  return !isLit(s) && s.drips.length === 0 && s.gush === null && s.poolHeat === 0;
}

/** The session is over and everything has set: the candle's final shape. */
export function isSettled(s: CandleState): boolean {
  return (s.flame === 'finished' || s.flame === 'abandoned') && isQuiet(s);
}

/** Every bit of wax, wherever it is now. Should always equal `totalWax`. */
export function waxAccountedFor(s: CandleState): number {
  const inDrips = s.drips.reduce((sum, d) => sum + d.mass, 0);
  const inTears = s.tears.reduce((sum, t) => sum + t.mass, 0);
  const onBase  = s.base.reduce((sum, h) => sum + h, 0) * BASE_DX;
  const inGush  = s.gush?.remaining ?? 0;
  return s.column + s.pool + inGush + s.burned + inDrips + inTears + onBase;
}

export function baseColumnAt(x: number): number {
  const i = Math.floor((x + BASE_HALF_WIDTH) / BASE_DX);
  return Math.min(BASE_COLS - 1, Math.max(0, i));
}

export function notchX(i: number): number {
  return -CANDLE_HALF_WIDTH + ((i + 0.5) / RIM_NOTCHES) * CANDLE_HALF_WIDTH * 2;
}

/** Where a tear's line sits at height y (it runs straight from its top to its tip). */
export function tearXAt(t: Tear, y: number): number {
  if (t.y0 - t.y1 < 1e-9) return t.x1;
  return t.x0 + (t.x1 - t.x0) * ((t.y0 - y) / (t.y0 - t.y1));
}

/** The rim strength a notch drifts back to: a little weaker on the side this candle leans. */
function rimRest(s: CandleState, i: number): number {
  return 0.5 - 0.12 * s.lean * (notchX(i) / CANDLE_HALF_WIDTH);
}

// ── Time ──────────────────────────────────────────────────────────────────────────

/**
 * Move the candle forward by `seconds` of wall time. Returns a new state; the input is
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
    if (isQuiet(s)) {
      // Nothing can move until the flame is relit, so let the rest of the time pass in
      // one go — an hour-long pause shouldn't cost 14,400 empty steps.
      const steps = Math.floor(s.carryMs / STEP_MS);
      s.stepCount += steps;
      s.carryMs -= steps * STEP_MS;
      break;
    }
    s.carryMs -= STEP_MS;
    step(s);
  }
  return s;
}

/** One fixed step of the rules. Mutates `s` — only ever called on a private clone. */
function step(s: CandleState): void {
  s.stepCount++;
  melt(s);
  trimTears(s);
  settlePool(s);
  spill(s);
  moveDrips(s);
  if (isLit(s)) relaxRim(s);
}

// ── The rules ─────────────────────────────────────────────────────────────────────

/**
 * While lit, the flame melts the column at a constant rate; most of it burns, the rest
 * pools. The rate is set so the column reaches the stub exactly when the focus time is
 * up — and that's the moment the flame goes out on its own.
 */
function melt(s: CandleState): void {
  if (!isLit(s)) return;
  s.litMs += STEP_MS;
  const rate = (s.totalWax - STUB_HEIGHT) / (s.durationMs / 1000);
  const lastStep = s.litMs >= s.durationMs;
  // On the final step, take exactly what's left above the stub so the flame goes out on
  // the dot instead of a float's width before or after it.
  const melted = lastStep ? s.column - STUB_HEIGHT : Math.min(s.column - STUB_HEIGHT, rate * DT);
  if (lastStep) {
    s.column = STUB_HEIGHT;
    s.flame = 'finished';
  } else {
    s.column -= melted;
  }

  // The flame's appetite wanders a little step to step, so the pool fills unevenly.
  const share = Math.min(0.98, Math.max(0.6, s.burnShare + between(s, -0.06, 0.06)));
  s.burned += melted * share;
  s.pool   += melted * (1 - share);
}

/**
 * As the flame burns down past the top of a tear, the part above the new surface melts
 * back into the pool. Tears shorten from the top — which is why a finished stub keeps
 * only the tears that ran low, the way a real one does.
 */
function trimTears(s: CandleState): void {
  const keep: Tear[] = [];
  for (const t of s.tears) {
    if (s.column >= t.y0) {
      keep.push(t);
    } else if (s.column <= t.y1) {
      s.pool += t.mass;
    } else {
      const cut = (t.y0 - s.column) / (t.y0 - t.y1);
      const melted = t.mass * cut;
      t.mass -= melted;
      s.pool += melted;
      t.x0 += (t.x1 - t.x0) * cut;
      t.y0 = s.column;
      keep.push(t);
    }
  }
  s.tears = keep;
}

/** The pool warms quickly under a flame and sets slowly (a minute or two) without one. */
function settlePool(s: CandleState): void {
  s.poolHeat = isLit(s)
    ? Math.min(1, s.poolHeat + 0.2 * DT)
    : Math.max(0, s.poolHeat - 0.01 * DT);
}

/**
 * When the molten pool tops out, the rim gives way at its weakest notch (plus a little
 * luck) and the pool partly empties through it as a gush: a bigger first drip, then a
 * few smaller ones a beat apart. Then quiet again while the pool refills.
 *
 * The notch erodes as it breaks, so it's likelier to be the weak spot next time — how
 * real candles carve channels. Wear is gentle and floored, and relaxRim heals it, or one
 * notch would win every gush and the whole candle would drip from one spot.
 */
function spill(s: CandleState): void {
  if (s.gush) { releaseGushDrip(s); return; }
  if (!isLit(s) || s.poolHeat < 0.6 || s.pool < s.spillAt) return;

  let notch = 0;
  let weakest = Infinity;
  for (let i = 0; i < RIM_NOTCHES; i++) {
    const score = s.rim[i] + between(s, 0, 0.5);
    if (score < weakest) { weakest = score; notch = i; }
  }
  s.rim[notch] = Math.max(0.15, s.rim[notch] - 0.08);

  const mass = s.pool * between(s, 0.35, 0.8);
  s.pool -= mass;
  s.spillAt = POOL_CAPACITY * between(s, 0.7, 1.4);
  s.gush = { notch, remaining: mass, wait: 0 };
  s.gushes++;
  releaseGushDrip(s);
}

function releaseGushDrip(s: CandleState): void {
  const g = s.gush;
  if (!g) return;
  if (g.wait > 0) { g.wait--; return; }

  const mass = g.remaining < 0.006 ? g.remaining : g.remaining * between(s, 0.35, 0.6);
  g.remaining -= mass;
  const x = notchX(g.notch) + between(s, -0.02, 0.02);
  s.drips.push({ x, y: s.column, mass, temp: 1, coolRate: between(s, 0.1, 0.28) });

  if (g.remaining <= 0) s.gush = null;
  else g.wait = Math.round(between(s, 1, 8));
}

/** The tear (if any) a point at (x, y) is sitting on. */
function tearUnder(s: CandleState, x: number, y: number): Tear | undefined {
  return s.tears.find((t) => y <= t.y0 && y >= t.y1 && Math.abs(tearXAt(t, y) - x) < TEAR_REACH);
}

/**
 * Drips run down while warm, slowing as they cool. Bigger drips hold heat longer and
 * run faster. A drip running over an old tear is on wax, not the cooler column, so it
 * keeps its heat longer and follows the tear's line. One that cools on the side joins
 * the tears; one that reaches the base lands on whatever wax is already there.
 */
function moveDrips(s: CandleState): void {
  const still: Drip[] = [];
  for (const d of s.drips) {
    const size = Math.sqrt(d.mass / 0.01);
    const tear = tearUnder(s, d.x, d.y);
    d.temp -= (d.coolRate * (tear ? 0.4 : 1) / size) * DT;
    d.y -= 0.5 * Math.max(0, d.temp) * size * DT;
    d.x = tear
      ? d.x + (tearXAt(tear, d.y) - d.x) * 0.3
      : d.x + between(s, -0.012, 0.012);
    d.x = Math.min(CANDLE_HALF_WIDTH, Math.max(-CANDLE_HALF_WIDTH, d.x));

    const floor = s.base[baseColumnAt(d.x)];
    if (d.y <= floor) {
      depositOnBase(s, d.x, d.mass, Math.max(0, d.temp));
    } else if (d.temp <= 0) {
      freezeOnSide(s, d);
    } else {
      still.push(d);
    }
  }
  s.drips = still;
}

/**
 * A drip that cools on the side becomes part of a tear. If it set on top of an existing
 * tear, that tear gets thicker; if it ran down a tear and set just past its tip, the
 * tear gets longer. Only a drip that found bare column starts a tear of its own — so a
 * session builds a few long, knobbly tears rather than a scatter of dots.
 */
function freezeOnSide(s: CandleState, d: Drip): void {
  const under = tearUnder(s, d.x, d.y);
  if (under) {
    under.mass += d.mass;
    return;
  }
  const extended = s.tears.find((t) => d.y < t.y1 && Math.abs(t.x1 - d.x) < TEAR_REACH * 1.5);
  if (extended) {
    extended.x1 = d.x;
    extended.y1 = d.y;
    extended.mass += d.mass;
    return;
  }
  s.tears.push({ x0: d.x, y0: s.column, x1: d.x, y1: d.y, mass: d.mass });
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
    s.rim[i] += (rimRest(s, i) - s.rim[i]) * 0.01 + between(s, -0.004, 0.004);
  }
}
