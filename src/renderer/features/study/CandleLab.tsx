import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Shuffle, Flame, FlameKindling, Snowflake, Ban } from 'lucide-react';
import {
  createCandle, advanceCandle, pauseCandle, resumeCandle, abandonCandle,
  waxAccountedFor, isLit, isSettled, elapsedMs, CANDLE_HEIGHT,
  type CandleState,
} from '../../../shared/candleSim';
import { createCandleRenderer, type CandleRenderer } from './candleRenderer';
import { formatClock } from '../../../shared/pomodoro';
import { cn } from '../../lib/utils';

// Dev-only workbench for the candle simulation (route: #/candle-lab, dev builds only).
// The drawing lives in candleRenderer.ts so Focus Mode can reuse it; this page is just
// controls, a readout, and the frame loop.
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

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
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
  const renderer  = useRef<CandleRenderer | null>(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Created once and kept across speed/freeze changes, so its glow and smoke carry on
    // instead of restarting every time a control is touched.
    renderer.current ??= createCandleRenderer(canvas, W, H);
    const paint = renderer.current;
    let frame = 0;
    let last  = performance.now();
    let lastReadout = 0;

    function tick(now: number) {
      const realSecs = (now - last) / 1000;
      last = now;
      if (!frozen) candle.current = advanceCandle(candle.current, realSecs * speed);
      paint.render(candle.current, now);
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
        <canvas ref={canvasRef} className="rounded-lg shrink-0" />
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
