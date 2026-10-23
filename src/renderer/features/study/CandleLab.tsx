import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Shuffle, Flame, FlameKindling, Snowflake, Ban } from 'lucide-react';
import {
  createCandle, advanceCandle, pauseCandle, resumeCandle, abandonCandle,
  waxAccountedFor, isLit, isSettled, elapsedMs,
  notchX, BASE_COLS, BASE_DX, BASE_HALF_WIDTH, CANDLE_HEIGHT, CANDLE_HALF_WIDTH, RIM_NOTCHES,
  type CandleState,
} from '../../../shared/candleSim';
import { formatClock } from '../../../shared/pomodoro';
import { cn } from '../../lib/utils';

// Dev-only workbench for the candle simulation (route: #/candle-lab, dev builds only).
// Prototype stage: the drawing is deliberately plain shapes so we can judge the
// *behaviour* — burn rate, gush rhythm, tears, how clumps build up — before polishing.
//
// The split to notice: the sim (shared/candleSim.ts) knows nothing about canvases or
// frames. This component owns the clock: each animation frame it asks "how much real
// time passed?", multiplies by the speed, hands that to advanceCandle, then draws the
// result. A slow frame or a hidden window just means a bigger chunk next time.
//
// Two different "pauses" live here, and they mean different things:
//  - Pause session: what the user's timer will do. The flame goes out, but time keeps
//    passing — the pool sets, drips in flight finish. That's a sim event.
//  - Freeze time: a dev tool. The sim clock stops entirely, so you can look closely.

const DURATIONS = [1, 25, 52, 90];
const SPEEDS    = [1, 10, 60, 600];

const W = 560;
const H = 440;
const SCALE  = 80;          // px per candle width
const ORIGIN = { x: W / 2, y: H - 40 };

const WAX      = '#efe6d2';
const WAX_DARK = '#d9ccb0';
const MOLTEN   = '#f2c46d';

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// World (candle units, y up) → canvas pixels (y down).
const px = (x: number) => ORIGIN.x + x * SCALE;
const py = (y: number) => ORIGIN.y - y * SCALE;

/** Blend two #rrggbb colours; t = 0 gives a, 1 gives b. */
function mix(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(',')})`;
}

function draw(ctx: CanvasRenderingContext2D, c: CandleState): void {
  ctx.clearRect(0, 0, W, H);

  // Table
  ctx.fillStyle = '#3a2f28';
  ctx.fillRect(0, ORIGIN.y, W, H - ORIGIN.y);

  // Column
  ctx.fillStyle = WAX;
  ctx.fillRect(px(-CANDLE_HALF_WIDTH), py(c.column), SCALE, c.column * SCALE);

  // Rim notches — darker = weaker; a gush comes from the weak spots.
  for (let i = 0; i < RIM_NOTCHES; i++) {
    const w = SCALE / RIM_NOTCHES;
    ctx.fillStyle = `rgba(120, 80, 40, ${0.6 * (1 - c.rim[i])})`;
    ctx.fillRect(px(notchX(i)) - w / 2, py(c.column), w, 4);
  }

  // Pool: amber while molten, fading to wax as it sets. Thickness tracks the volume.
  if (c.pool > 0) {
    ctx.fillStyle = mix(WAX_DARK, MOLTEN, c.poolHeat);
    ctx.fillRect(px(-CANDLE_HALF_WIDTH), py(c.column) - 2, SCALE, Math.max(2, c.pool * 120));
  }

  // Tears: thicker where more wax has run down them.
  ctx.strokeStyle = WAX_DARK;
  ctx.lineCap = 'round';
  for (const t of c.tears) {
    const length = Math.max(0.05, t.y0 - t.y1);
    ctx.lineWidth = Math.min(14, Math.max(2, (t.mass / length) * SCALE * 2.5));
    ctx.beginPath();
    ctx.moveTo(px(t.x0), py(t.y0));
    ctx.lineTo(px(t.x1), py(t.y1));
    ctx.stroke();
  }

  // Drips in flight — hotter is more orange
  for (const d of c.drips) {
    ctx.fillStyle = `rgb(240, ${200 - d.temp * 60}, ${150 - d.temp * 100})`;
    ctx.beginPath();
    ctx.arc(px(d.x), py(d.y), Math.sqrt(d.mass) * SCALE * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Base heightmap, drawn in front of the column
  const cellX = (i: number) => px(-BASE_HALF_WIDTH + (i + 0.5) * BASE_DX);
  ctx.fillStyle = WAX_DARK;
  ctx.beginPath();
  ctx.moveTo(px(-BASE_HALF_WIDTH), py(0));
  for (let i = 0; i < BASE_COLS; i++) ctx.lineTo(cellX(i), py(c.base[i]));
  ctx.lineTo(px(BASE_HALF_WIDTH), py(0));
  ctx.closePath();
  ctx.fill();

  // Pause seams: where the surface set before more wax landed on it. Only drawn where
  // something has since covered it — an uncovered seam is just the surface.
  ctx.strokeStyle = 'rgba(110, 85, 55, 0.55)';
  ctx.lineWidth = 1;
  for (const seam of c.seams) {
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i < BASE_COLS; i++) {
      const covered = c.base[i] - seam[i] > 0.01 && seam[i] > 0.005;
      if (covered && !drawing) { ctx.moveTo(cellX(i), py(seam[i])); drawing = true; }
      else if (covered)        { ctx.lineTo(cellX(i), py(seam[i])); }
      else                     { drawing = false; }
    }
    ctx.stroke();
  }

  // Flame. Its flicker uses Math.random on purpose: it's decoration, not state, so it
  // doesn't need to be reproducible — only the wax does.
  if (isLit(c)) {
    const fx = px(0);
    const fy = py(c.column) - 6;
    const h  = 34 + Math.random() * 8;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.ellipse(fx + (Math.random() - 0.5) * 2, fy - h / 2, 8, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.ellipse(fx, fy - h / 3, 4, h / 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A dark wick stub so an unlit candle doesn't look like it's missing something.
    ctx.fillStyle = '#2b2420';
    ctx.fillRect(px(0) - 1.5, py(c.column) - 10, 3, 10);
  }
}

const FLAME_LABELS: Record<CandleState['flame'], string> = {
  lit:       'Lit',
  paused:    'Paused',
  finished:  'Finished',
  abandoned: 'Abandoned',
};

export default function CandleLab() {
  const [durationMin, setDurationMin] = useState(25);
  const [speed, setSpeed]             = useState(60);
  const [frozen, setFrozen]           = useState(false);
  const [seed, setSeed]               = useState(randomSeed);
  const [readout, setReadout]         = useState<CandleState>(() => createCandle(seed, durationMin * 60_000));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candle    = useRef<CandleState>(readout);

  /** Replace the candle (a new one, or the result of a session event) and refresh the readout. */
  function setCandle(next: CandleState) {
    candle.current = next;
    setReadout(next);
  }

  // A new seed or duration lights a fresh candle.
  useEffect(() => {
    setCandle(createCandle(seed, durationMin * 60_000));
  }, [seed, durationMin]);

  // The frame loop. The candle lives in a ref, not state: it changes 60×/s and only
  // the canvas needs every frame. The text readout is refreshed a few times a second.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let last  = performance.now();
    let lastReadout = 0;

    function tick(now: number) {
      const realSecs = (now - last) / 1000;
      last = now;
      if (!frozen) candle.current = advanceCandle(candle.current, realSecs * speed);
      if (ctx) draw(ctx, candle.current);
      if (now - lastReadout > 200) {
        lastReadout = now;
        setReadout(candle.current);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [frozen, speed]);

  const c = readout;
  const accounted = waxAccountedFor(c);
  const sessionOver = c.flame === 'finished' || c.flame === 'abandoned';

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Candle lab</h1>
        <p className="text-sm text-stone-500">Dev-only prototype of the study candle. Behaviour first, looks later.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Segmented label="Session" options={DURATIONS} value={durationMin} onChange={setDurationMin} format={(m) => `${m}m`} />
        <Segmented label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} format={(s) => `${s}×`} />
        <LabButton onClick={() => setFrozen((f) => !f)}>
          {frozen ? <Play size={14} /> : <Snowflake size={14} />} {frozen ? 'Unfreeze time' : 'Freeze time'}
        </LabButton>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500 mr-2">Session</span>
        <LabButton
          disabled={sessionOver}
          onClick={() => setCandle(isLit(candle.current) ? pauseCandle(candle.current) : resumeCandle(candle.current))}
        >
          {c.flame === 'paused' ? <Flame size={14} /> : <Pause size={14} />} {c.flame === 'paused' ? 'Resume' : 'Pause'}
        </LabButton>
        <LabButton disabled={sessionOver} onClick={() => setCandle(abandonCandle(candle.current))}>
          <Ban size={14} /> Abandon
        </LabButton>
        <span className="mx-2 h-5 w-px bg-stone-300" />
        <LabButton onClick={() => setCandle(createCandle(seed, durationMin * 60_000))}>
          <RotateCcw size={14} /> Replay seed
        </LabButton>
        <LabButton onClick={() => setSeed(randomSeed())}>
          <Shuffle size={14} /> New candle
        </LabButton>
      </div>

      <div className="flex gap-6 items-start">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-lg bg-[#1f1a17] shrink-0" />
        <dl className="text-xs font-mono grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
          <dt className="text-stone-500">seed</dt>      <dd>{c.seed}</dd>
          <dt className="text-stone-500">flame</dt>
          <dd className="inline-flex items-center gap-1">
            {isLit(c) ? <Flame size={12} /> : <FlameKindling size={12} />}
            {FLAME_LABELS[c.flame]}{isSettled(c) && ' · settled'}
          </dd>
          <dt className="text-stone-500">burned for</dt><dd>{formatClock(Math.floor(c.litMs / 1000))} / {formatClock(c.durationMs / 1000)}</dd>
          <dt className="text-stone-500">wall time</dt> <dd>{formatClock(Math.floor(elapsedMs(c) / 1000))}</dd>
          <dt className="text-stone-500">column</dt>    <dd>{c.column.toFixed(3)} / {CANDLE_HEIGHT}</dd>
          <dt className="text-stone-500">pool</dt>      <dd>{c.pool.toFixed(4)} · {Math.round(c.poolHeat * 100)}% molten</dd>
          <dt className="text-stone-500">burned</dt>    <dd>{c.burned.toFixed(3)}</dd>
          <dt className="text-stone-500">burn share</dt><dd>{(c.burnShare * 100).toFixed(1)}%</dd>
          <dt className="text-stone-500">lean</dt>      <dd>{c.lean > 0 ? 'right' : 'left'} {Math.abs(c.lean).toFixed(2)}</dd>
          <dt className="text-stone-500">gushes</dt>    <dd>{c.gushes}{c.gush && ' · pouring'}</dd>
          <dt className="text-stone-500">drips</dt>     <dd>{c.drips.length} running</dd>
          <dt className="text-stone-500">tears</dt>     <dd>{c.tears.length} on the side</dd>
          <dt className="text-stone-500">seams</dt>     <dd>{c.seams.length}</dd>
          <dt className="text-stone-500">base peak</dt> <dd>{Math.max(...c.base).toFixed(3)}</dd>
          <dt className="text-stone-500">wax total</dt>
          <dd className={cn(Math.abs(accounted - c.totalWax) > 1e-9 && 'text-red-600')}>{accounted.toFixed(9)}</dd>
        </dl>
      </div>
    </div>
  );
}

function LabButton({ children, onClick, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Segmented({ label, options, value, onChange, format }: {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-stone-500">{label}</span>
      <div className="flex rounded border overflow-hidden">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)}
            className={cn('px-2 py-1', o === value && 'bg-stone-800 text-white')}>
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
