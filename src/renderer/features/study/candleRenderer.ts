import {
  isLit, notchX, STEP_MS, BASE_COLS, BASE_DX, BASE_HALF_WIDTH, CANDLE_HALF_WIDTH, RIM_NOTCHES,
  type CandleState, type Drip, type Tear,
} from '../../../shared/candleSim';

// Draws a candle simulation onto a canvas.
//
// The sim (shared/candleSim.ts) decides *what* is there — how tall the column is, where
// each tear runs, the shape of the puddle. This file decides how it *looks*, and keeps
// its own small state for things that are purely visual: how bright the glow is this
// instant (it eases in on relight and out on a pause), the smoke curling up after the
// flame goes out, the flicker. That state runs on real time and Math.random(), never on
// the sim's seeded generator — decoration must never be able to change the wax.
//
// Lighting is done in two passes over the finished scene, the way games fake it cheaply:
//  1. Multiply — a radial gradient, near-white at the flame and dark far away. Multiply
//     can only darken, so one fill gives every surface (wax, puddle, table, room) the
//     right falloff at once. With the flame out it flattens to a dim ambient, which is
//     why a pause visibly dims the room.
//  2. Lighter (additive) — a warm glow around the flame, brightening what's near it.
// The flame itself is drawn after both, so the light source is never dimmed by its own
// light.
//
// Drawn for Focus Mode's room: the backdrop stops are the room's (DESIGN.md, "Scene
// palette — Focus Mode"), and the wax is a warm ivory that reads as candlelight there.

export interface CandleRenderer {
  /** Draw `state` as of `nowMs` (a performance.now() timestamp). Call once per frame. */
  render(state: CandleState, nowMs: number): void;
}

const ROOM_STOPS = ['#241a12', '#160f0a', '#0c0806'] as const;

const WAX = {
  light: '#f6ecd8',
  mid:   '#e8d9bc',
  shade: '#c4ad88',
  deep:  '#93795a',
} as const;
const WAX_SET = '#e2d0ad';
const MOLTEN  = '#f4cd83';
const WICK    = '#2a1d14';

/** How far the top surface's ellipse dips toward the viewer — the "seen from slightly above" tilt. */
const TOP_RY = 0.075;

// Lighting stops for the multiply pass, flame lit and flame out. Blended by glow.
const LIGHT_LIT   = ['#fff8ec', '#f4e2c6', '#b49473', '#4a392b'];
const LIGHT_DARK  = ['#9a8775', '#94816f', '#7d6b5b', '#4a3a2d'];
const LIGHT_STOPS = [0, 0.18, 0.45, 1];

// ── Colour helpers ──────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

function rgbOf(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

/** Blend two #rrggbb colours; t = 0 gives a, 1 gives b. */
function mix(a: string, b: string, t: number, alpha = 1): string {
  const ca = rgbOf(a);
  const cb = rgbOf(b);
  const [r, g, bl] = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgba(${r},${g},${bl},${alpha})`;
}

function withAlpha(hex: string, alpha: number): string {
  return `rgba(${rgbOf(hex).join(',')},${alpha})`;
}

/** Move `current` toward `target` by at most `step`. */
function approach(current: number, target: number, step: number): number {
  return current + Math.max(-step, Math.min(step, target - current));
}

/** A smooth, never-repeating-looking wobble in -1..1: three sines at unrelated speeds. */
function wobble(t: number, p: number[]): number {
  return 0.55 * Math.sin(t * 1.3 + p[0]) + 0.3 * Math.sin(t * 2.9 + p[1]) + 0.15 * Math.sin(t * 6.7 + p[2]);
}

// ── Scene geometry ──────────────────────────────────────────────────────────────

interface View {
  width: number;
  height: number;
  /** px per candle width */
  scale: number;
  originX: number;
  originY: number;
}

// World (candle units, y up) → canvas px (y down).
const px = (v: View, x: number) => v.originX + x * v.scale;
const py = (v: View, y: number) => v.originY - y * v.scale;

/** How far the rim dips at x: a worn notch sits a little lower. Interpolated between notches. */
function rimDip(c: CandleState, x: number): number {
  const f = ((x + CANDLE_HALF_WIDTH) / (CANDLE_HALF_WIDTH * 2)) * RIM_NOTCHES - 0.5;
  const i = Math.max(0, Math.min(RIM_NOTCHES - 1, Math.floor(f)));
  const j = Math.min(RIM_NOTCHES - 1, i + 1);
  const t = Math.max(0, Math.min(1, f - i));
  const rim = c.rim[i] + (c.rim[j] - c.rim[i]) * t;
  return (rim - 0.5) * 0.1;
}

/** World y of the front edge of the column's top at x — the lip you see facing you. */
function lipY(c: CandleState, x: number): number {
  const e = Math.sqrt(Math.max(0, 1 - (x / CANDLE_HALF_WIDTH) ** 2));
  return c.column - TOP_RY * e + rimDip(c, x);
}

function columnPath(ctx: CanvasRenderingContext2D, v: View, c: CandleState): void {
  ctx.beginPath();
  ctx.moveTo(px(v, -CANDLE_HALF_WIDTH), py(v, 0));
  for (let x = -CANDLE_HALF_WIDTH; x <= CANDLE_HALF_WIDTH + 1e-9; x += 0.02) {
    ctx.lineTo(px(v, x), py(v, lipY(c, x)));
  }
  ctx.lineTo(px(v, CANDLE_HALF_WIDTH), py(v, 0));
  ctx.closePath();
}

// ── Pieces of the scene ─────────────────────────────────────────────────────────

function drawRoom(ctx: CanvasRenderingContext2D, v: View): void {
  const g = ctx.createRadialGradient(v.width / 2, v.height * 0.4, 0, v.width / 2, v.height * 0.4, v.width * 0.75);
  g.addColorStop(0, ROOM_STOPS[0]);
  g.addColorStop(0.55, ROOM_STOPS[1]);
  g.addColorStop(1, ROOM_STOPS[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.width, v.height);

  // The table: a dark wooden surface the candle stands on.
  const top = py(v, 0);
  const t = ctx.createLinearGradient(0, top, 0, v.height);
  t.addColorStop(0, '#3d2c1f');
  t.addColorStop(1, '#1b130c');
  ctx.fillStyle = t;
  ctx.fillRect(0, top, v.width, v.height - top);
  ctx.fillStyle = 'rgba(255, 225, 185, 0.07)';
  ctx.fillRect(0, top, v.width, 1);

  // Soft contact shadow where the candle and its puddle meet the table.
  ctx.save();
  ctx.translate(px(v, 0), top + 2);
  ctx.scale(1, 0.11);
  const s = ctx.createRadialGradient(0, 0, 0, 0, 0, v.scale * 1.3);
  s.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  s.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = s;
  ctx.beginPath();
  ctx.arc(0, 0, v.scale * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The top surface: the rim's lip and the pool of wax inside it, molten or set.
 * `fill` (0..1) is how close the pool is to spilling: the molten pool visibly widens
 * toward the rim as wax melts into it, so a gush arrives as the end of something you
 * watched build — and shrinks back as the gush drains it.
 */
function drawTop(ctx: CanvasRenderingContext2D, v: View, c: CandleState, glow: number, fill: number): void {
  const cx = px(v, 0);
  const cy = py(v, c.column);
  const rx = CANDLE_HALF_WIDTH * v.scale;
  const ry = TOP_RY * v.scale;

  // The rim, lit from the flame just above it. Its back edge is the far half of the
  // ellipse; its front edge is the real lip, worn notches and all — so where the rim has
  // dipped you see down onto the top surface instead of through a gap to the room.
  const rimFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  rimFill.addColorStop(0, mix(WAX.light, '#fff1d6', glow));
  rimFill.addColorStop(1, WAX.mid);
  ctx.fillStyle = rimFill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
  for (let x = CANDLE_HALF_WIDTH; x >= -CANDLE_HALF_WIDTH - 1e-9; x -= 0.02) {
    ctx.lineTo(px(v, x), py(v, lipY(c, x)));
  }
  ctx.closePath();
  ctx.fill();

  // The pool: a small melt cup around the wick when nearly empty, reaching almost to the
  // rim when it's about to spill. Honey while molten, matte wax as it sets.
  const reach = 0.42 + 0.48 * Math.sqrt(Math.max(0, Math.min(1, fill)));
  const prx = rx * reach;
  const pry = ry * reach * 0.88;
  const pcy = cy + ry * 0.1;
  ctx.fillStyle = mix(WAX_SET, MOLTEN, c.poolHeat);
  ctx.beginPath();
  ctx.ellipse(cx, pcy, prx, pry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (c.poolHeat > 0.05) {
    // A soft sheen across the liquid, brighter the fuller and hotter it is.
    const sheen = ctx.createRadialGradient(cx - prx * 0.3, pcy - pry * 0.2, 0, cx - prx * 0.3, pcy - pry * 0.2, prx * 0.7);
    sheen.addColorStop(0, `rgba(255, 248, 228, ${0.35 * c.poolHeat})`);
    sheen.addColorStop(1, 'rgba(255, 248, 228, 0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(cx, pcy, prx, pry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The standing column: a shaded cylinder, glowing warm near the top while lit. */
function drawColumn(ctx: CanvasRenderingContext2D, v: View, c: CandleState, glow: number): void {
  columnPath(ctx, v, c);
  const body = ctx.createLinearGradient(px(v, -CANDLE_HALF_WIDTH), 0, px(v, CANDLE_HALF_WIDTH), 0);
  body.addColorStop(0,    WAX.shade);
  body.addColorStop(0.12, WAX.mid);
  body.addColorStop(0.38, WAX.light);
  body.addColorStop(0.62, WAX.mid);
  body.addColorStop(0.9,  WAX.shade);
  body.addColorStop(1,    WAX.deep);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.save();
  columnPath(ctx, v, c);
  ctx.clip();

  // Wax is translucent: near a flame the top of the candle glows from inside.
  if (glow > 0) {
    const top = py(v, c.column);
    const inner = ctx.createLinearGradient(0, top, 0, top + v.scale * 1.1);
    inner.addColorStop(0, `rgba(255, 186, 100, ${0.5 * glow})`);
    inner.addColorStop(1, 'rgba(255, 186, 100, 0)');
    ctx.fillStyle = inner;
    ctx.fillRect(px(v, -CANDLE_HALF_WIDTH), top - 10, v.scale, v.scale * 1.2);
  }

  // A little darkening toward the foot, where less light reaches.
  const foot = ctx.createLinearGradient(0, py(v, 0), 0, py(v, 0.5));
  foot.addColorStop(0, 'rgba(70, 48, 28, 0.28)');
  foot.addColorStop(1, 'rgba(70, 48, 28, 0)');
  ctx.fillStyle = foot;
  ctx.fillRect(px(v, -CANDLE_HALF_WIDTH), py(v, 0.5), v.scale, v.scale * 0.5);
  ctx.restore();
}

/** A stable 0..2π phase from two numbers, so a rope's knobbliness doesn't shimmer frame to frame. */
function phaseOf(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 3111.7) * 43758.5453;
  return (h - Math.floor(h)) * Math.PI * 2;
}

/**
 * The blob at the end of a run of wax. Running drips and set tears share these sizing
 * rules, so a drip that stops becomes a tear of the same shape — only its colour
 * changes, and it has already cooled to wax colour by then. Kept small: a big round
 * bead is what makes a drop read as water rather than wax.
 */
function beadRadius(mass: number): number {
  return Math.min(5.5, 1.8 + Math.sqrt(mass) * 14);
}

/** Rope thickness for `mass` of wax spread down `lengthUnits`. Square root, not linear: a thin run still has to read as wax, not a crack. */
function ropeWidth(v: View, mass: number, lengthUnits: number): number {
  return Math.min(9, Math.max(2.6, Math.sqrt(mass / Math.max(0.04, lengthUnits)) * v.scale * 0.9));
}

/** A run of wax in canvas px: from where it leaves the rim (x0, y0) down to its tip (x1, y1). */
interface Rope {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  /** Horizontal radius of the end blob; 0 for a run that ends in the puddle with no blob. */
  bead: number;
  phase: number;
  /** Hangs off the rim, so it gets a little hump of wax where it spills over the lip. */
  hangs: boolean;
}

interface RopeColours {
  light: string;
  mid: string;
  shade: string;
  edge: string;
}

const SET_ROPE: RopeColours    = { light: '#fbf1dc', mid: '#ecd9b4', shade: '#c9ab80', edge: '#96764f' };
// Liquid wax is translucent, so it looks deeper and more honey-coloured than solid wax
// (which scatters light and reads white). That darker tone is also what lets a hot drip
// stand out against a column that's glowing warm near the flame.
const MOLTEN_ROPE: RopeColours = { light: '#ffdf96', mid: '#e5a84e', shade: '#b0702a', edge: '#8a5520' };

/** How much taller than wide a drip's end is. Wax drips end in an elongated blob, not a sphere. */
const TIP_STRETCH = 1.3;

/**
 * Trace a run of wax as one outline: down the left side, round the tip, back up the
 * right. The rope swells smoothly into its end blob over its last few pixels, so the
 * sides flow straight into the tip — no step where a line meets a circle.
 */
function ropePath(ctx: CanvasRenderingContext2D, r: Rope, dx = 0, dy = 0): void {
  const x0 = r.x0 + dx;
  const y0 = r.y0 + dy;
  const x1 = r.x1 + dx;
  const y1 = r.y1 + dy;
  const lengthPx = Math.max(1, y1 - y0);

  // The rope itself: thin where it leaves the rim, fuller lower down, with a gentle
  // knobbly wobble where successive drips set on top of each other.
  const ropeHalf = (f: number) =>
    (r.width / 2) * (0.45 + 0.55 * f * f * (3 - 2 * f)) * (1 + 0.12 * Math.sin(f * lengthPx / 6 + r.phase));
  const tip = Math.max(ropeHalf(1), Math.min(r.bead, lengthPx * 0.4));
  const swell = Math.min(lengthPx * 0.6, tip * 2.6);
  const halfAt = (f: number) => {
    const u = Math.max(0, Math.min(1, (f * lengthPx - (lengthPx - swell)) / swell));
    return ropeHalf(f) + (tip - ropeHalf(f)) * u * u * (3 - 2 * u);
  };

  const steps = Math.max(6, Math.ceil(lengthPx / 3));
  ctx.beginPath();
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const x = x0 + (x1 - x0) * f - halfAt(f);
    const y = y0 + (y1 - y0) * f;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  // The tip: half an ellipse, its sides vertical where they meet the rope's.
  ctx.ellipse(x1, y1, tip, r.bead > 0 ? tip * TIP_STRETCH : tip, 0, Math.PI, 0, true);
  for (let k = steps; k >= 0; k--) {
    const f = k / steps;
    ctx.lineTo(x0 + (x1 - x0) * f + halfAt(f), y0 + (y1 - y0) * f);
  }
  ctx.closePath();
}

/**
 * Paint a run of wax so it stands off the column: a shadow cast away from the flame, a
 * rounded body, a soft edge, the hump where it spills over the lip, and a satin sheen.
 * `gloss` (0..1) is how wet it looks — a hot drip has a little more sheen — but wax is
 * never glassy: no hard white glint, which is what makes a drop read as water.
 */
function paintRope(ctx: CanvasRenderingContext2D, r: Rope, colours: RopeColours, gloss: number): void {
  // 0 for the thinnest trail, 1 for a full rope. Thin trails get a lighter shadow and no
  // outline — at that width, both read as a second line beside the trail.
  const heft = Math.min(1, Math.max(0, (r.width - 2.6) / 4));
  const tip = Math.max(r.width / 2, Math.min(r.bead, (r.y1 - r.y0) * 0.4));

  ropePath(ctx, r, 1.4, 1.8);
  ctx.fillStyle = `rgba(60, 40, 22, ${0.12 + 0.2 * heft})`;
  ctx.fill();

  ropePath(ctx, r);
  const body = ctx.createLinearGradient(r.x1 - tip * 1.3, 0, r.x1 + tip * 1.3, 0);
  body.addColorStop(0,   colours.light);
  body.addColorStop(0.5, colours.mid);
  body.addColorStop(1,   colours.shade);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = withAlpha(colours.edge, 0.4 * Math.max(heft, gloss));
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Where it spills over the rim: a low hump of wax sitting on the lip, so the run is
  // visibly attached to the top rather than starting from a hard line.
  if (r.hangs) {
    const rx = Math.max(2.2, r.width * 0.55);
    const hump = ctx.createLinearGradient(0, r.y0 - 1.4, 0, r.y0 + 2);
    hump.addColorStop(0, colours.mid);
    hump.addColorStop(1, colours.light);
    ctx.fillStyle = hump;
    ctx.beginPath();
    ctx.ellipse(r.x0, r.y0 + 0.5, rx, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A soft highlight down the lit side.
  if (r.y1 - r.y0 > tip * 3) {
    ctx.strokeStyle = `rgba(255, 250, 240, ${0.16 + 0.16 * gloss})`;
    ctx.lineWidth = Math.max(0.7, r.width * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r.x0 - r.width * 0.12, r.y0 + 3);
    ctx.lineTo(r.x1 - tip * 0.4, r.y1 - tip * 1.2);
    ctx.stroke();
  }

  // Satin sheen on the tip: a broad, faint glow, not a pinpoint.
  if (r.bead > 0) {
    const sx = r.x1 - tip * 0.3;
    const sy = r.y1 - tip * 0.2;
    const sheen = ctx.createRadialGradient(sx, sy, 0, sx, sy, tip * 1.1);
    sheen.addColorStop(0, `rgba(255, 250, 240, ${0.22 + 0.18 * gloss})`);
    sheen.addColorStop(1, 'rgba(255, 250, 240, 0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(sx, sy, tip * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The puddle's drawn surface height at x, in candle units. */
function surfaceAt(surface: number[], x: number): number {
  return surface[Math.min(BASE_COLS - 1, Math.max(0, Math.floor((x + BASE_HALF_WIDTH) / BASE_DX)))];
}

/**
 * Where a run of wax leaves the top. Tears hang from the rim (the sim keeps their top at
 * the column's height as it burns down), and the rim seen from slightly above is the
 * front lip — a few px lower than the column's centre. Starting there keeps streaks
 * from poking up over the top surface.
 */
function ropeTop(v: View, c: CandleState, x: number, y: number): { y: number; hangs: boolean } {
  const hangs = y >= c.column - 0.02;
  return { y: hangs ? py(v, lipY(c, x)) : py(v, y), hangs };
}

function drawTear(ctx: CanvasRenderingContext2D, v: View, c: CandleState, t: Tear, surface: number[]): void {
  const top = ropeTop(v, c, t.x0, t.y0);
  // A run that reached the table ends in the puddle: no blob, and its end tucked under
  // the puddle's edge so the two read as one piece of wax.
  const floor = surfaceAt(surface, t.x1);
  const intoPuddle = floor > 0.004 && t.y1 <= floor + 0.015;
  paintRope(ctx, {
    x0: px(v, t.x0), y0: top.y,
    x1: px(v, t.x1), y1: intoPuddle ? py(v, floor) + 4 : py(v, t.y1),
    width: ropeWidth(v, t.mass, t.y0 - t.y1),
    bead: intoPuddle ? 0 : beadRadius(t.mass),
    phase: phaseOf(t.x0, t.mass),
    hangs: top.hangs,
  }, SET_ROPE, 0);
}

/**
 * A drip on its way down: a molten rope from where it left the rim to its tip, honey
 * coloured while hot, turning to wax colour as it cools.
 *
 * The sim only moves drips in STEP_MS jumps, so drawing (x, y) directly would hop four
 * times a second. Instead it's drawn `alpha` of the way from where it was one step ago
 * to where it is now — alpha being how far we are into the next step. That's render
 * interpolation: the picture runs smooth at any frame rate while the rules stay fixed.
 */
function drawRunningDrip(ctx: CanvasRenderingContext2D, v: View, c: CandleState, d: Drip, alpha: number): void {
  const x = d.prevX + (d.x - d.prevX) * alpha;
  const y = d.prevY + (d.y - d.prevY) * alpha;
  const start = Math.min(d.startY, c.column);
  const top = ropeTop(v, c, d.startX, start);
  const heat = Math.max(0, Math.min(1, d.temp));
  const colours: RopeColours = {
    light: mix(SET_ROPE.light, MOLTEN_ROPE.light, heat),
    mid:   mix(SET_ROPE.mid,   MOLTEN_ROPE.mid,   heat),
    shade: mix(SET_ROPE.shade, MOLTEN_ROPE.shade, heat),
    edge:  heat > 0.5 ? MOLTEN_ROPE.edge : SET_ROPE.edge,
  };
  paintRope(ctx, {
    x0: px(v, d.startX), y0: top.y,
    x1: px(v, x), y1: Math.max(top.y + 1, py(v, y)),
    width: ropeWidth(v, d.mass, start - y),
    bead: beadRadius(d.mass),
    phase: phaseOf(d.startX, d.mass),
    hangs: top.hangs,
  }, colours, heat);
}

/** Molten wax bulging over the lip where the rim has given way — the cue that a gush is coming down. */
function drawOverflow(ctx: CanvasRenderingContext2D, v: View, c: CandleState, x: number, amount: number): void {
  const cx = px(v, x);
  const rx = 5.5 * amount;
  const ry = 3.6 * amount;
  const cy = py(v, lipY(c, x)) + ry * 0.3;
  const fill = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  fill.addColorStop(0, mix(SET_ROPE.light, MOLTEN_ROPE.light, c.poolHeat));
  fill.addColorStop(1, mix(SET_ROPE.mid, MOLTEN_ROPE.mid, c.poolHeat));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A small blur along the heightmap: [1, 4, 6, 4, 1] / 16. Same total, softer shape. */
function soften(heights: number[]): number[] {
  const k = [1, 4, 6, 4, 1];
  return heights.map((_, i) => {
    let sum = 0;
    let weight = 0;
    for (let j = -2; j <= 2; j++) {
      const h = heights[i + j];
      if (h === undefined) continue;
      sum += h * k[j + 2];
      weight += k[j + 2];
    }
    return sum / weight;
  });
}

const cellX = (v: View, i: number) => px(v, -BASE_HALF_WIDTH + (i + 0.5) * BASE_DX);

/**
 * The puddle's surface as drawn. `base` is the renderer's eased copy of the sim's
 * heightmap, so landing wax spreads out over a few seconds rather than appearing at once.
 *
 * The sim's heightmap settles at its angle of repose, which reads as sharp sand-pile
 * peaks. Set wax is rounded off by surface tension, so the outline is softened before
 * drawing. Display only: the wax itself isn't moved, so conservation is untouched.
 */
function puddleSurface(base: number[]): number[] {
  return soften(soften(soften(base)));
}

/** The hardened puddle on the table, drawn in front of the column's foot. */
function drawPuddle(ctx: CanvasRenderingContext2D, v: View, heights: number[], seams: number[][]): void {
  const first = heights.findIndex((h) => h > 0.003);
  if (first < 0) return;
  let last = first;
  for (let i = BASE_COLS - 1; i > first; i--) {
    if (heights[i] > 0.003) { last = i; break; }
  }
  const peak = Math.max(...heights);

  // Only the stretch that actually has wax, so bare table never gets a hairline.
  const points: (readonly [number, number])[] = [];
  for (let i = first; i <= last; i++) points.push([cellX(v, i), py(v, heights[i])]);
  const surface = () => {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i][0] + points[i + 1][0]) / 2;
      const my = (points[i][1] + points[i + 1][1]) / 2;
      ctx.quadraticCurveTo(points[i][0], points[i][1], mx, my);
    }
    ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
  };

  ctx.beginPath();
  ctx.moveTo(points[0][0], py(v, 0));
  ctx.lineTo(points[0][0], points[0][1]);
  surface();
  ctx.lineTo(points[points.length - 1][0], py(v, 0));
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, py(v, peak), 0, py(v, 0));
  fill.addColorStop(0, '#f1e5cb');
  fill.addColorStop(1, '#c6ae88');
  ctx.fillStyle = fill;
  ctx.fill();

  // Light catching the top of the wax.
  ctx.save();
  ctx.beginPath();
  surface();
  ctx.strokeStyle = 'rgba(255, 247, 232, 0.5)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  // Pause seams: where the surface set before more wax landed on it. Only drawn where
  // something has since covered it — an uncovered seam is just the surface.
  ctx.strokeStyle = 'rgba(128, 98, 66, 0.4)';
  ctx.lineWidth = 0.9;
  for (const rawSeam of seams) {
    const seam = soften(soften(soften(rawSeam)));
    ctx.beginPath();
    let drawing = false;
    for (let i = first; i <= last; i++) {
      const covered = heights[i] - seam[i] > 0.012 && seam[i] > 0.006;
      const x = cellX(v, i);
      const y = py(v, seam[i]);
      if (covered && !drawing) { ctx.moveTo(x, y); drawing = true; }
      else if (covered)        { ctx.lineTo(x, y); }
      else                     { drawing = false; }
    }
    ctx.stroke();
  }
}

function drawWick(ctx: CanvasRenderingContext2D, v: View, c: CandleState): { x: number; y: number } {
  const x = px(v, 0);
  const base = py(v, c.column) + 1;
  const tipX = x + 2.2;
  const tipY = py(v, c.column + 0.14);
  ctx.strokeStyle = WICK;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x - 0.5, (base + tipY) / 2, tipX, tipY);
  ctx.stroke();
  return { x: tipX, y: tipY };
}

/** The classic candle-flame teardrop, base at (bx, by), tip `height` above, leaning by `tipDx`. */
function teardrop(ctx: CanvasRenderingContext2D, bx: number, by: number, w: number, height: number, tipDx: number): void {
  ctx.beginPath();
  ctx.moveTo(bx + tipDx, by - height);
  ctx.bezierCurveTo(bx + tipDx * 0.5 - w * 0.25, by - height * 0.62, bx - w * 1.05, by - height * 0.36, bx - w * 0.92, by - height * 0.14);
  ctx.bezierCurveTo(bx - w * 0.8, by + w * 0.35, bx + w * 0.8, by + w * 0.35, bx + w * 0.92, by - height * 0.14);
  ctx.bezierCurveTo(bx + w * 1.05, by - height * 0.36, bx + tipDx * 0.5 + w * 0.25, by - height * 0.62, bx + tipDx, by - height);
  ctx.closePath();
}

function drawFlame(
  ctx: CanvasRenderingContext2D, bx: number, by: number, size: number, sway: number, stretch: number, bright: number,
): void {
  const height = 46 * size * stretch;
  const w = 7.5 * size;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Close halo.
  const hx = bx + sway * 0.5;
  const hy = by - height * 0.45;
  const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, height * 0.95);
  halo.addColorStop(0, `rgba(255, 190, 110, ${0.3 * size * bright})`);
  halo.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(hx - height, hy - height, height * 2, height * 2);

  // Outer envelope: blue at the root, orange to yellow up the body, fading at the tip.
  ctx.filter = 'blur(1.2px)';
  teardrop(ctx, bx, by, w, height, sway);
  const outer = ctx.createLinearGradient(bx, by, bx + sway, by - height);
  outer.addColorStop(0,    `rgba(110, 130, 255, ${0.55 * bright})`);
  outer.addColorStop(0.14, `rgba(255, 140, 50, ${0.75 * bright})`);
  outer.addColorStop(0.45, `rgba(255, 190, 90, ${0.85 * bright})`);
  outer.addColorStop(0.8,  `rgba(255, 170, 80, ${0.5 * bright})`);
  outer.addColorStop(1,    'rgba(255, 140, 60, 0)');
  ctx.fillStyle = outer;
  ctx.fill();

  // Bright inner core.
  ctx.filter = 'blur(0.6px)';
  teardrop(ctx, bx, by - height * 0.06, w * 0.55, height * 0.62, sway * 0.6);
  const core = ctx.createLinearGradient(bx, by, bx, by - height * 0.7);
  core.addColorStop(0,   `rgba(255, 235, 190, ${0.2 * bright})`);
  core.addColorStop(0.3, `rgba(255, 250, 230, ${0.95 * bright})`);
  core.addColorStop(1,   `rgba(255, 240, 200, ${0.55 * bright})`);
  ctx.fillStyle = core;
  ctx.fill();

  // Faint blue at the root, where the wax vapour first meets air.
  ctx.filter = 'blur(1px)';
  ctx.fillStyle = `rgba(90, 120, 255, ${0.35 * size})`;
  ctx.beginPath();
  ctx.ellipse(bx, by - 2 * size, w * 0.75, 3 * size, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.filter = 'none';
  ctx.restore();
}

// ── Smoke ───────────────────────────────────────────────────────────────────────

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  phase: number;
}

function stepSmoke(puffs: Puff[], dt: number): Puff[] {
  for (const p of puffs) {
    p.age += dt;
    p.vy *= 0.995;
    p.x += p.vx * dt + Math.sin(p.age * 2.2 + p.phase) * 6 * dt;
    p.y += p.vy * dt;
  }
  return puffs.filter((p) => p.age < p.life);
}

function drawSmoke(ctx: CanvasRenderingContext2D, puffs: Puff[]): void {
  for (const p of puffs) {
    const r = 1.5 + p.age * 5;
    const a = 0.14 * (1 - p.age / p.life) * Math.min(1, p.age * 4);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(205, 195, 185, ${a})`);
    g.addColorStop(1, 'rgba(205, 195, 185, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── The renderer ────────────────────────────────────────────────────────────────

/**
 * Set a canvas up for drawing candles at `width` × `height` CSS pixels. The backing
 * store is sized for the screen's pixel ratio, so the candle stays crisp on a Retina
 * display instead of being drawn at half resolution and stretched.
 */
export function createCandleRenderer(canvas: HTMLCanvasElement, width = 560, height = 440): CandleRenderer {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('Canvas 2D is not available');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width  = `${width}px`;
  canvas.style.height = `${height}px`;

  const view: View = { width, height, scale: 80, originX: width / 2, originY: height - 44 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const phases = Array.from({ length: 8 }, () => Math.random() * Math.PI * 2);

  let lastNow: number | null = null;
  let wasLit: boolean | null = null;
  let glow = 0;        // 0..1, how much the flame is lighting the scene right now
  let flameSize = 0;   // 0..1, grows on relight, shrinks fast when snuffed
  let ember = 0;       // 0..1, the wick's afterglow once the flame is out
  let smokeLeft = 0;   // seconds of smoke still to give off
  let smokeDebt = 0;   // fractional puffs carried between frames
  let puffs: Puff[] = [];
  let overflow = 0;    // 0..1, how far molten wax is bulging over the rim
  let overflowX = 0;   // where it's bulging
  let shownBase: number[] = [];   // the puddle as drawn, easing up toward the sim's
  let shownSeed: number | null = null;
  let poolFill = 0;    // 0..1, the pool's fullness as drawn, easing toward the sim's

  return {
    render(c, nowMs) {
      const dt = lastNow === null ? 0 : Math.min(0.1, (nowMs - lastNow) / 1000);
      lastNow = nowMs;
      const t = nowMs / 1000;
      const still = reducedMotion.matches;
      const lit = isLit(c);

      // Snuffed this frame: a wisp of smoke and a fading ember, the way a real wick goes.
      if (wasLit === true && !lit) {
        ember = 1;
        smokeLeft = still ? 0 : 2.2;
      }
      wasLit = lit;

      glow      = approach(glow, lit ? 1 : 0, dt / (lit ? 0.8 : 1.6));
      flameSize = approach(flameSize, lit ? 1 : 0, dt / (lit ? 0.9 : 0.15));
      ember     = approach(ember, 0, dt / 2.5);
      if (c.gush) overflowX = notchX(c.gush.notch);
      overflow  = approach(overflow, c.gush ? 1 : 0, dt / 0.35);

      // How far we are into the sim's next step, for drawing drips between steps.
      const alpha = c.carryMs / STEP_MS;

      // Ease the drawn puddle up toward the real one so landing wax flows out and settles
      // over a few seconds instead of appearing at once. Shrinking only happens on a new
      // candle (or a replay), and that snaps straight to the new shape.
      if (shownSeed !== c.seed || shownBase.length !== c.base.length) {
        shownBase = [...c.base];
        shownSeed = c.seed;
        poolFill = c.pool / c.spillAt;
      } else {
        const k = still ? 1 : 1 - Math.exp(-dt * 1.2);
        for (let i = 0; i < c.base.length; i++) {
          const target = c.base[i];
          shownBase[i] = target < shownBase[i] ? target : shownBase[i] + (target - shownBase[i]) * k;
        }
        // The pool drains over the second or so a gush takes, rather than in one frame.
        poolFill += (c.pool / c.spillAt - poolFill) * (still ? 1 : 1 - Math.exp(-dt * 2.5));
      }
      const surface = puddleSurface(shownBase);

      const sway    = still ? 0 : 2.4 * wobble(t, phases);
      const stretch = still ? 1 : 1 + 0.05 * wobble(t * 1.4, phases.slice(3));
      const bright  = still ? 1 : 1 + 0.04 * Math.sin(t * 11 + phases[6]) + 0.03 * Math.sin(t * 17.3 + phases[7]);
      const light   = glow * Math.min(1, bright);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // The scene, at full brightness.
      drawRoom(ctx, view);
      drawTop(ctx, view, c, glow, poolFill);
      drawColumn(ctx, view, c, glow);
      if (overflow > 0.01) drawOverflow(ctx, view, c, overflowX, overflow);
      for (const tear of c.tears) drawTear(ctx, view, c, tear, surface);
      for (const drip of c.drips) drawRunningDrip(ctx, view, c, drip, alpha);
      drawPuddle(ctx, view, surface, c.seams);
      const wick = drawWick(ctx, view, c);

      // Lighting pass 1: falloff from the flame (or a dim ambient with it out).
      const fx = wick.x + sway * 0.5;
      const fy = wick.y - 20;
      const reach = view.height * 1.15;
      const falloff = ctx.createRadialGradient(fx, fy, 0, fx, fy, reach);
      LIGHT_STOPS.forEach((stop, i) => falloff.addColorStop(stop, mix(LIGHT_DARK[i], LIGHT_LIT[i], light)));
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = falloff;
      ctx.fillRect(0, 0, view.width, view.height);

      // Lighting pass 2: the warm glow the flame throws around it.
      if (light > 0.01) {
        const warm = ctx.createRadialGradient(fx, fy, 0, fx, fy, 190);
        warm.addColorStop(0,   `rgba(255, 176, 90, ${0.3 * light})`);
        warm.addColorStop(0.4, `rgba(255, 150, 70, ${0.1 * light})`);
        warm.addColorStop(1,   'rgba(255, 150, 70, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, view.width, view.height);
      }
      ctx.globalCompositeOperation = 'source-over';

      // The light source itself, never dimmed by its own lighting.
      if (ember > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 120, 40, ${0.85 * ember})`;
        ctx.beginPath();
        ctx.arc(wick.x, wick.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (flameSize > 0.01) drawFlame(ctx, wick.x - 1, wick.y + 4, flameSize, sway, stretch, bright);

      // Smoke rises from the wick for a couple of seconds after the flame goes out.
      if (smokeLeft > 0) {
        smokeLeft -= dt;
        smokeDebt += dt * 30;
        while (smokeDebt >= 1) {
          smokeDebt -= 1;
          puffs.push({
            x: wick.x, y: wick.y - 2,
            vx: (Math.random() - 0.5) * 6, vy: -22 - Math.random() * 10,
            age: 0, life: 2.5 + Math.random(), phase: Math.random() * Math.PI * 2,
          });
        }
      }
      puffs = stepSmoke(puffs, dt);
      drawSmoke(ctx, puffs);
    },
  };
}
