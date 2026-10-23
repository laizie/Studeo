import { useEffect, useRef } from 'react';
import { createCandle, pauseCandle, type CandleState } from '../../../shared/candleSim';
import { followCandle, isCandleActive, type LiveCandle } from '../../../shared/candleSession';
import { useCandleStore } from '../../store/useCandleStore';
import { useTimerStore } from '../../store/useTimerStore';
import { createCandleRenderer } from './candleRenderer';

// Focus Mode's candle: it burns for the focus block and down to its stub when the block
// is done. The candle store holds the block's record; this keeps a live candle in step
// with it, frame by frame, and draws it.
//
// What's on screen:
//  - During a focus block (running or paused): that block's candle.
//  - During a break: the candle from the block just finished — a stub in its puddle, or
//    left standing tall if the block was given up — as a record of it.
//  - Ready for a new block: a fresh, unlit candle waiting to be lit by Start.
//
// It reads both stores with getState() inside the frame loop rather than subscribing
// with hooks: the canvas redraws every frame anyway, so re-rendering React on each
// change would be pure overhead.

/**
 * The renderer's native scene size; the canvas is scaled to `width` with CSS. The scene
 * is the lab's 560 × 440 plus HEADROOM above it, so the flame's glow fades out inside
 * the canvas instead of being sliced off flat at its top edge. That headroom is only
 * glow, so it hangs up out of the layout box behind whatever sits above the candle,
 * rather than pushing the clock down.
 */
const SCENE_W  = 560;
const SCENE_H  = 440;
const HEADROOM = 200;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

interface Props {
  /** Displayed width in CSS px; the height follows the scene's proportions. */
  width: number;
}

export default function FocusCandle({ width }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createCandleRenderer(canvas, SCENE_W, SCENE_H + HEADROOM, 'none');
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${(width * (SCENE_H + HEADROOM)) / SCENE_W}px`;

    let live: LiveCandle | null = null;
    let fresh: CandleState | null = null;
    let frame = 0;

    const draw = () => {
      const now = Date.now();
      const { record } = useCandleStore.getState();
      const { phase, isRunning, timeLeft } = useTimerStore.getState();

      // A new block hasn't been lit yet: focus is up next and the clock is stopped, with
      // no live candle for it. (While the clock is running, the block's candle shows even
      // in the second between it burning down and the timer moving on to the break.)
      const waitingToLight =
        !record || (phase === 'focus' && !isRunning && !isCandleActive(record, now));

      let state: CandleState;
      if (waitingToLight || !record) {
        live = null;
        fresh ??= pauseCandle(createCandle(randomSeed(), Math.max(1, timeLeft) * 1000));
        state = fresh;
      } else {
        fresh = null;
        live = followCandle(live, record, now);
        state = live.state;
      }

      renderer.render(state, performance.now());
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [width]);

  // The box takes the scene's own height; the canvas sits on its bottom edge and the
  // headroom overflows upward. -z-10 puts it beneath the page's content, so the glow
  // lights the room behind the text above instead of washing over it.
  return (
    <div className="relative" style={{ width, height: (width * SCENE_H) / SCENE_W }}>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute bottom-0 left-0 -z-10 select-none" />
    </div>
  );
}
