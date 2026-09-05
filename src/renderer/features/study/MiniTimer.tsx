import { useEffect, useReducer, useState } from 'react';
import { Play, Pause, SkipForward, X } from 'lucide-react';
import {
  PHASE_LABELS, PHASE_COLORS, CYCLE_LENGTH,
  formatClock, secondsLeft,
  type MiniTimerState,
} from '../../../shared/pomodoro';

/**
 * The floating Pomodoro pill — the whole contents of the pop-out window.
 *
 * Two rules govern this file:
 *
 * 1. It must NOT import useTimerStore. This renders in its own window, so importing
 *    the store would create a second, independent timer here (and its startup recovery
 *    would log a duplicate study session). Everything it knows arrives as a snapshot
 *    over IPC; every button sends a command back to the window that owns the timer.
 *
 * 2. It doesn't follow the app's theme. This sits on top of the user's desktop, over a
 *    wallpaper or someone else's white document, not inside Studeo's page — so it's a
 *    dark glass chip in every theme, with the phase color as its only accent.
 */

// Dark glass, deliberately fixed (see rule 2 above).
const CARD_BG     = 'rgba(26, 25, 23, 0.88)';
const CARD_BORDER = 'rgba(255, 255, 255, 0.10)';
const INK         = '#f6f4f0';
const MUTED       = 'rgba(246, 244, 240, 0.55)';

/** The pill itself: the whole window is one rounded card, and the whole card is the
 *  drag handle (there's no title bar to grab). Controls opt back out with `no-drag`,
 *  or they'd move the window instead of being clicked. */
const CARD: React.CSSProperties = {
  WebkitAppRegion: 'drag',
  background: CARD_BG,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 16,
  backdropFilter: 'blur(20px) saturate(140%)',
  color: INK,
  position: 'relative',
  overflow: 'hidden',
  height: '100%',
  userSelect: 'none',
  cursor: 'default',
} as React.CSSProperties;

/** A ghost button on the pill: invisible until you want it. */
function ghostStyle(hovered: boolean): React.CSSProperties {
  return {
    color: hovered ? INK : MUTED,
    background: hovered ? 'rgba(255,255,255,0.10)' : 'transparent',
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties;
}

function useHover(): [boolean, { onMouseEnter: () => void; onMouseLeave: () => void }] {
  const [hovered, setHovered] = useState(false);
  return [hovered, { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }];
}

export default function MiniTimer() {
  const [state, setState] = useState<MiniTimerState | null>(null);

  // A counter, not a timestamp. The clock is read live during render (below), and this
  // exists only to schedule the next paint.
  //
  // Holding `Date.now()` in state was a real bug, and it showed up exactly when you
  // pressed play: while the timer is paused nothing re-renders, so that timestamp goes
  // stale by however long the pill has been sitting there. The first frame after the
  // running snapshot arrives then computed `endsAt - <stale now>` — a clock minutes too
  // high, which snapped back a quarter-second later. Reading the real clock at render
  // time makes that whole class of staleness impossible.
  const [, scheduleRepaint] = useReducer((n: number) => n + 1, 0);

  const [closeHover, closeHandlers] = useHover();
  const [skipHover,  skipHandlers]  = useHover();

  useEffect(() => {
    // Subscribe BEFORE asking for the cached snapshot, and let any push win over it.
    // The other order has two races: a push landing between the ask and the subscribe
    // is lost, and a slow reply can arrive after a newer push and overwrite it with
    // older state. (The cached read is still needed — a paused timer publishes nothing
    // until it moves, so waiting for a push alone would leave the pill blank.)
    let pushed = false;
    const off = window.api.miniTimer.onState(s => { pushed = true; setState(s); });
    void window.api.miniTimer.getState().then(s => { if (s && !pushed) setState(s); });
    return off;
  }, []);

  // The countdown is computed here from `endsAt`, not sent tick by tick: the owner
  // window only messages us when something really changes, and this stays smooth
  // (and correct after a sleep/wake) regardless.
  // 100ms, not 250: this window and the main one both flip on the timer's own
  // boundary (see msUntilClockChange), and this is how closely the pill's repaint
  // chases that boundary. A quarter-second sample was enough to catch the eye when
  // the two clocks were side by side; a tenth of a second is not.
  useEffect(() => {
    if (!state?.isRunning) return;
    const id = setInterval(scheduleRepaint, 100);
    return () => clearInterval(id);
  }, [state?.isRunning]);

  // Before the first snapshot lands, show the card rather than nothing. The window is
  // transparent, so an empty render is an INVISIBLE window — you'd click "Pop out" and
  // watch nothing happen until the state arrived.
  if (!state) {
    return (
      <div style={CARD} className="flex items-center px-3.5">
        <div style={{ color: MUTED, fontSize: 27, lineHeight: 1.05 }} className="font-semibold tabular-nums">
          --:--
        </div>
      </div>
    );
  }

  const secs     = secondsLeft(state);
  const color    = PHASE_COLORS[state.phase];
  const progress = state.totalSecs > 0 ? 1 - secs / state.totalSecs : 0;

  const send = (command: 'start' | 'pause' | 'skip') => window.api.miniTimer.command(command);

  return (
    <div
      style={CARD}
      onDoubleClick={() => { void window.api.miniTimer.showMain(); }}
      title="Double-click to open Studeo"
      className="flex items-center gap-2.5 pl-3.5 pr-2.5"
    >
      {/* Phase + clock */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            style={{ background: color, width: 6, height: 6, borderRadius: 999 }}
            aria-hidden
          />
          <span
            style={{ color: MUTED, fontSize: 9.5, letterSpacing: '0.09em' }}
            className="font-medium uppercase"
          >
            {PHASE_LABELS[state.phase]}
          </span>
          {/* Cycle dots: how many focus blocks until the long break. */}
          <span className="flex items-center gap-1 ml-0.5" aria-hidden>
            {Array.from({ length: CYCLE_LENGTH }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 3.5,
                  height: 3.5,
                  borderRadius: 999,
                  background: i < state.focusCount % CYCLE_LENGTH ? color : 'rgba(255,255,255,0.20)',
                }}
              />
            ))}
          </span>
        </div>
        <div
          style={{ fontSize: 27, lineHeight: 1.05, letterSpacing: '-0.02em' }}
          className="font-semibold tabular-nums mt-1"
        >
          {formatClock(secs)}
        </div>
      </div>

      {/* Play / pause — the reason the pop-out has controls at all. */}
      <button
        onClick={() => send(state.isRunning ? 'pause' : 'start')}
        aria-label={state.isRunning ? 'Pause timer' : 'Start timer'}
        title={state.isRunning ? 'Pause' : 'Start'}
        style={{
          WebkitAppRegion: 'no-drag',
          background: color,
          color: '#1a1917',
          width: 38,
          height: 38,
        } as React.CSSProperties}
        className="shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-95 hover:opacity-90"
      >
        {state.isRunning
          ? <Pause size={16} fill="currentColor" strokeWidth={0} />
          : <Play size={16} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
      </button>

      {/* Skip — same meaning as on the Study page: bank the minutes, move on. */}
      <button
        onClick={() => send('skip')}
        {...skipHandlers}
        aria-label={state.phase === 'focus' ? 'Skip to break' : 'Skip break'}
        title={state.phase === 'focus' ? "Skip to break — keeps the minutes you've put in" : 'Skip the break'}
        style={{ ...ghostStyle(skipHover), width: 28, height: 28 }}
        className="shrink-0 flex items-center justify-center rounded-full transition-colors"
      >
        <SkipForward size={14} />
      </button>

      {/* Close the pop-out. The timer keeps running — this hides the window, it
          doesn't stop anything. */}
      <button
        onClick={() => { void window.api.miniTimer.closeSelf(); }}
        {...closeHandlers}
        aria-label="Close the pop-out timer"
        title="Close (the timer keeps running)"
        style={{ ...ghostStyle(closeHover), position: 'absolute', top: 4, right: 4, width: 18, height: 18 }}
        className="flex items-center justify-center rounded-full transition-colors"
      >
        <X size={11} />
      </button>

      {/* Progress hairline along the bottom edge. */}
      <div
        style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: `${Math.min(100, Math.max(0, progress * 100))}%`,
          background: color,
          opacity: 0.9,
          transition: 'width 250ms linear',
        }}
        aria-hidden
      />
    </div>
  );
}
