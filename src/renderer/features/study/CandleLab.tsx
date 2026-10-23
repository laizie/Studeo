import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react';
import {
  createCandle, advanceCandle, waxAccountedFor, isLit, isBurntOut, elapsedMs,
  notchX, BASE_COLS, BASE_DX, BASE_HALF_WIDTH, CANDLE_HEIGHT, RIM_NOTCHES,
  type CandleState,
} from '../../../shared/candleSim';
import { formatClock } from '../../../shared/pomodoro';
import { cn } from '../../lib/utils';

// Dev-only workbench for the candle simulation (route: #/candle-lab, dev builds only).
// Prototype stage: the drawing is deliberately plain boxes and blobs so we can judge
// the *behaviour* — burn rate, drip rhythm, how clumps build up — before polishing looks.
//
// The split to notice: the sim (shared/candleSim.ts) knows nothing about canvases or
// frames. This component owns the clock: each animation frame it asks "how much real
// time passed?", multiplies by the speed, hands that to advanceCandle, then draws the
// result. A slow frame or a hidden window just means a bigger chunk next time.

const DURATIONS = [1, 25, 52, 90];
const SPEEDS    = [1, 10, 60, 600];

const W = 560;
const H = 440;
const SCALE  = 80;          // px per candle width
const ORIGIN = { x: W / 2, y: H - 40 };

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// World (candle units, y up) → canvas pixels (y down).
const px = (x: number) => ORIGIN.x + x * SCALE;
const py = (y: number) => ORIGIN.y - y * SCALE;

function draw(ctx: CanvasRenderingContext2D, c: CandleState): void {
  ctx.clearRect(0, 0, W, H);

  // Table
  ctx.fillStyle = '#3a2f28';
  ctx.fillRect(0, ORIGIN.y, W, H - ORIGIN.y);

  // Column
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(px(-0.5), py(c.column), SCALE, c.column * SCALE);

  // Rim notches — darker = weaker; a spill comes from the weak spots.
  if (c.column > 0) {
    for (let i = 0; i < RIM_NOTCHES; i++) {
      const w = SCALE / RIM_NOTCHES;
      ctx.fillStyle = `rgba(120, 80, 40, ${0.6 * (1 - c.rim[i])})`;
      ctx.fillRect(px(notchX(i)) - w / 2, py(c.column), w, 4);
    }
  }

  // Melt pool, as a bar whose thickness tracks the liquid volume
  if (c.pool > 0) {
    ctx.fillStyle = '#f2c46d';
    ctx.fillRect(px(-0.5), py(c.column) - 2, SCALE, Math.max(1, c.pool * 300));
  }

  // Beads: drips that hardened on the side, drawn as streaks
  ctx.strokeStyle = '#e4d6b8';
  ctx.lineCap = 'round';
  for (const b of c.beads) {
    ctx.lineWidth = Math.sqrt(b.mass) * SCALE;
    ctx.beginPath();
    ctx.moveTo(px(b.x0), py(b.y0));
    ctx.lineTo(px(b.x1), py(b.y1));
    ctx.stroke();
  }

  // Drips in flight — hotter is more orange
  for (const d of c.drips) {
    ctx.fillStyle = `rgb(240, ${200 - d.temp * 60}, ${150 - d.temp * 100})`;
    ctx.beginPath();
    ctx.arc(px(d.x), py(d.y), Math.sqrt(d.mass) * SCALE * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Base heightmap, drawn in front of the column
  ctx.fillStyle = '#e8dcc2';
  ctx.beginPath();
  ctx.moveTo(px(-BASE_HALF_WIDTH), py(0));
  for (let i = 0; i < BASE_COLS; i++) {
    ctx.lineTo(px(-BASE_HALF_WIDTH + (i + 0.5) * BASE_DX), py(c.base[i]));
  }
  ctx.lineTo(px(BASE_HALF_WIDTH), py(0));
  ctx.closePath();
  ctx.fill();

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
  }
}

export default function CandleLab() {
  const [durationMin, setDurationMin] = useState(25);
  const [speed, setSpeed]             = useState(60);
  const [running, setRunning]         = useState(true);
  const [seed, setSeed]               = useState(randomSeed);
  const [readout, setReadout]         = useState<CandleState>(() => createCandle(seed, durationMin * 60_000));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candle    = useRef<CandleState>(readout);

  // A new seed or duration lights a fresh candle.
  useEffect(() => {
    candle.current = createCandle(seed, durationMin * 60_000);
    setReadout(candle.current);
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
      if (running) candle.current = advanceCandle(candle.current, realSecs * speed);
      if (ctx) draw(ctx, candle.current);
      if (now - lastReadout > 200) {
        lastReadout = now;
        setReadout(candle.current);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, speed]);

  const c = readout;
  const accounted = waxAccountedFor(c);
  const status = isBurntOut(c) ? 'Burnt out' : isLit(c) ? 'Burning' : 'Settling';

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Candle lab</h1>
        <p className="text-sm text-stone-500">Dev-only prototype of the study candle. Behaviour first, looks later.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Segmented label="Session" options={DURATIONS} value={durationMin} onChange={setDurationMin} format={(m) => `${m}m`} />
        <Segmented label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} format={(s) => `${s}×`} />
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause size={14} /> : <Play size={14} />} {running ? 'Pause' : 'Play'}
        </button>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border" onClick={() => {
          candle.current = createCandle(seed, durationMin * 60_000);
          setReadout(candle.current);
        }}>
          <RotateCcw size={14} /> Replay seed
        </button>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border" onClick={() => setSeed(randomSeed())}>
          <Shuffle size={14} /> New candle
        </button>
      </div>

      <div className="flex gap-6 items-start">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-lg bg-[#1f1a17] shrink-0" />
        <dl className="text-xs font-mono grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
          <dt className="text-stone-500">seed</dt>      <dd>{c.seed}</dd>
          <dt className="text-stone-500">status</dt>    <dd>{status}</dd>
          <dt className="text-stone-500">elapsed</dt>   <dd>{formatClock(Math.floor(elapsedMs(c) / 1000))} / {formatClock(c.durationMs / 1000)}</dd>
          <dt className="text-stone-500">column</dt>    <dd>{c.column.toFixed(3)} / {CANDLE_HEIGHT}</dd>
          <dt className="text-stone-500">pool</dt>      <dd>{c.pool.toFixed(4)}</dd>
          <dt className="text-stone-500">burned</dt>    <dd>{c.burned.toFixed(3)}</dd>
          <dt className="text-stone-500">burn share</dt><dd>{(c.burnShare * 100).toFixed(1)}%</dd>
          <dt className="text-stone-500">drips</dt>     <dd>{c.drips.length} running</dd>
          <dt className="text-stone-500">beads</dt>     <dd>{c.beads.length} on the side</dd>
          <dt className="text-stone-500">base peak</dt> <dd>{Math.max(...c.base).toFixed(3)}</dd>
          <dt className="text-stone-500">wax total</dt>
          <dd className={cn(Math.abs(accounted - c.totalWax) > 1e-9 && 'text-red-600')}>{accounted.toFixed(9)}</dd>
        </dl>
      </div>
    </div>
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
