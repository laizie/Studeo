import {
  isLit, BASE_COLS, BASE_DX, BASE_HALF_WIDTH, CANDLE_HALF_WIDTH, RIM_NOTCHES,
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

/** The top surface: the rim's lip and the cup of wax inside it, molten or set. */
function drawTop(ctx: CanvasRenderingContext2D, v: View, c: CandleState, glow: number): void {
  const cx = px(v, 0);
  const cy = py(v, c.column);
  const rx = CANDLE_HALF_WIDTH * v.scale;
  const ry = TOP_RY * v.scale;

  // The rim, lit from the flame just above it.
  const rimFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  rimFill.addColorStop(0, mix(WAX.light, '#fff1d6', glow));
  rimFill.addColorStop(1, WAX.mid);
  ctx.fillStyle = rimFill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // The pool: amber and glossy while molten, matte as it sets.
  const prx = rx * 0.82;
  const pry = ry * 0.72;
  const pcy = cy + ry * 0.12;
  ctx.fillStyle = mix(WAX_SET, MOLTEN, c.poolHeat);
  ctx.beginPath();
  ctx.ellipse(cx, pcy, prx, pry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (c.poolHeat > 0.05) {
    ctx.fillStyle = `rgba(255, 250, 235, ${0.45 * c.poolHeat})`;
    ctx.beginPath();
    ctx.ellipse(cx - prx * 0.35, pcy - pry * 0.25, prx * 0.32, pry * 0.28, -0.1, 0, Math.PI * 2);
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

/** A stable per-tear phase for its knobbliness, so a tear doesn't shimmer frame to frame. */
function tearPhase(t: Tear): number {
  const h = Math.sin(t.x0 * 127.1 + t.mass * 3111.7) * 43758.5453;
  return (h - Math.floor(h)) * Math.PI * 2;
}

function tearPath(ctx: CanvasRenderingContext2D, v: View, t: Tear, dx = 0, dy = 0): { cx: number; cy: number; r: number } {
  const x0 = px(v, t.x0) + dx;
  const y0 = py(v, t.y0) + dy;
  const x1 = px(v, t.x1) + dx;
  const y1 = py(v, t.y1) + dy;
  const lengthPx = Math.max(2, y1 - y0);
  const lengthUnits = Math.max(0.04, t.y0 - t.y1);
  // Square root, not linear: a thin tear still has to read as a rope of wax, not a crack.
  const width = Math.min(9, Math.max(2.6, Math.sqrt(t.mass / lengthUnits) * v.scale * 0.9));
  const phase = tearPhase(t);

  // Half-width down the tear: thin where it hangs from the rim, fuller lower down,
  // with a gentle knobbly wobble where successive drips set on top of each other.
  const halfWidth = (f: number) =>
    (width / 2) * (0.35 + 0.65 * f * f * (3 - 2 * f)) * (1 + 0.16 * Math.sin(f * lengthPx / 6 + phase));

  const steps = Math.max(4, Math.ceil(lengthPx / 4));
  const bulb = Math.max(halfWidth(1) * 1.35, 2.2 + Math.sqrt(t.mass) * 14);

  ctx.beginPath();
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const x = x0 + (x1 - x0) * f - halfWidth(f);
    const y = y0 + (y1 - y0) * f;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  // Round bead at the tip, where the last drip stopped.
  ctx.arc(x1, y1, bulb, Math.PI, 0, true);
  for (let k = steps; k >= 0; k--) {
    const f = k / steps;
    ctx.lineTo(x0 + (x1 - x0) * f + halfWidth(f), y0 + (y1 - y0) * f);
  }
  ctx.closePath();
  return { cx: x1, cy: y1, r: bulb };
}

function drawTear(ctx: CanvasRenderingContext2D, v: View, t: Tear): void {
  // Shadow on the column first, nudged away from the light.
  tearPath(ctx, v, t, 1.4, 1.8);
  ctx.fillStyle = 'rgba(70, 48, 28, 0.22)';
  ctx.fill();

  const { cx, cy, r } = tearPath(ctx, v, t);
  const g = ctx.createLinearGradient(cx - r * 1.2, 0, cx + r * 1.2, 0);
  g.addColorStop(0,   WAX.light);
  g.addColorStop(0.5, WAX.mid);
  g.addColorStop(1,   WAX.shade);
  ctx.fillStyle = g;
  ctx.fill();

  // A small specular glint on the bead.
  ctx.fillStyle = 'rgba(255, 250, 238, 0.55)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.3, Math.max(0.6, r * 0.32), 0, Math.PI * 2);
  ctx.fill();
}

function drawDrip(ctx: CanvasRenderingContext2D, v: View, d: Drip): void {
  const x = px(v, d.x);
  const y = py(v, d.y);
  const r = Math.max(1.4, Math.sqrt(d.mass) * v.scale * 0.42);
  const tail = r * (0.8 + 1.4 * d.temp);

  // A falling bead with a short tail, amber and translucent while hot.
  ctx.fillStyle = mix(WAX.mid, MOLTEN, d.temp, 0.95);
  ctx.beginPath();
  ctx.moveTo(x, y - r - tail);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 0.6, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.quadraticCurveTo(x - r * 0.9, y - r * 0.6, x, y - r - tail);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 250, 238, 0.6)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.2, Math.max(0.5, r * 0.3), 0, Math.PI * 2);
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

/** The hardened puddle on the table, drawn in front of the column's foot. */
function drawPuddle(ctx: CanvasRenderingContext2D, v: View, c: CandleState): void {
  // The sim's heightmap settles at its angle of repose, which reads as sharp sand-pile
  // peaks. Set wax is rounded off by surface tension, so the outline is softened before
  // drawing. Display only: the wax itself isn't moved, so conservation is untouched.
  const heights = soften(soften(c.base));
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
  for (const rawSeam of c.seams) {
    const seam = soften(soften(rawSeam));
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

      const sway    = still ? 0 : 2.4 * wobble(t, phases);
      const stretch = still ? 1 : 1 + 0.05 * wobble(t * 1.4, phases.slice(3));
      const bright  = still ? 1 : 1 + 0.04 * Math.sin(t * 11 + phases[6]) + 0.03 * Math.sin(t * 17.3 + phases[7]);
      const light   = glow * Math.min(1, bright);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // The scene, at full brightness.
      drawRoom(ctx, view);
      drawTop(ctx, view, c, glow);
      drawColumn(ctx, view, c, glow);
      for (const tear of c.tears) drawTear(ctx, view, tear);
      for (const drip of c.drips) drawDrip(ctx, view, drip);
      drawPuddle(ctx, view, c);
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
