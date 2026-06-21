import { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, X, CheckCircle2, Circle } from 'lucide-react';
import {
  useTimerStore, PHASE_LABELS, PHASE_COLORS, formatClock, type Phase,
} from '../../store/useTimerStore';
import { useStudyListStore } from '../../store/useStudyListStore';
import { useFocusStore } from '../../store/useFocusStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUpdateAssignment } from '../../lib/queries/useAssignments';
import { useUpdateTask } from '../../lib/queries/useTasks';
import { useUpdateStudySession } from '../../lib/queries/useStudySessions';
import AppleMusicMiniPlayer from '../applemusic/AppleMusicMiniPlayer';
import SpotifyMiniPlayer from '../spotify/SpotifyMiniPlayer';
import ProgressRing from './ProgressRing';
import { cn } from '../../lib/utils';

// ── Intention line ─────────────────────────────────────────────────────────────
// Before a focus block, an open invitation: "I'm here to ___". Once the block is
// running we stop competing for attention and show it as quiet, settled text.
function IntentionLine({ running }: { running: boolean }) {
  const intention    = useTimerStore(s => s.intention);
  const setIntention = useTimerStore(s => s.setIntention);

  if (running) {
    return (
      <p className="min-h-[1.5rem] text-center text-sm text-muted">
        {intention.trim() ? <>I'm here to <span className="text-ink-soft">{intention.trim()}</span></> : 'In focus'}
      </p>
    );
  }

  return (
    <label className="flex items-baseline justify-center gap-2 text-sm text-muted">
      <span className="shrink-0">I'm here to</span>
      <input
        type="text"
        value={intention}
        onChange={e => setIntention(e.target.value)}
        placeholder="…name one thing"
        aria-label="Session intention"
        className="w-[min(60vw,22rem)] border-b border-line bg-transparent pb-0.5 text-center text-ink-soft placeholder:text-muted/70 focus:border-accent focus:outline-none transition-colors"
      />
    </label>
  );
}

// ── Reflection card ─────────────────────────────────────────────────────────────
// Shown the moment a focus block ends: one quiet line to close the loop. Submitting
// saves it onto the just-logged session; skipping just dismisses.
function ReflectionCard() {
  const lastFocusSessionId   = useTimerStore(s => s.lastFocusSessionId);
  const clearReflectionPrompt = useTimerStore(s => s.clearReflectionPrompt);
  const updateSession = useUpdateStudySession();
  const [text, setText] = useState('');

  function submit() {
    const reflection = text.trim();
    if (reflection && lastFocusSessionId) {
      updateSession.mutate({ id: lastFocusSessionId, input: { reflection } });
    }
    clearReflectionPrompt();
  }

  return (
    <div className="w-[min(90vw,28rem)] rounded-2xl border border-line bg-surface/80 px-8 py-7 text-center shadow-sm backdrop-blur">
      <p className="text-lg font-medium text-ink">Nice work — that's one block done.</p>
      <p className="mt-1 text-sm text-muted">How did it go? (optional)</p>
      <input
        type="text"
        value={text}
        autoFocus
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="e.g. Slow start, but finished the outline"
        aria-label="Session reflection"
        className="mt-4 w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-colors"
      />
      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          onClick={clearReflectionPrompt}
          className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
        >
          Skip
        </button>
        <button
          onClick={submit}
          className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-accent-ink hover:bg-accent-deep transition-colors"
        >
          Save reflection
        </button>
      </div>
    </div>
  );
}

// ── Focus list (compact, checkable) ─────────────────────────────────────────────
function FocusList() {
  const { items, toggleDone } = useStudyListStore();
  const updateAssignment = useUpdateAssignment();
  const updateTask       = useUpdateTask();

  if (items.length === 0) return null;

  function handleToggle(id: string, type: 'assignment' | 'task', currentlyDone: boolean) {
    toggleDone(id);
    const status = currentlyDone ? 'not_started' : 'completed';
    if (type === 'assignment') updateAssignment.mutate({ id, input: { status } });
    else                       updateTask.mutate({ id, input: { status } });
  }

  return (
    <div className="w-[min(90vw,24rem)] space-y-1">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => handleToggle(item.id, item.type, item.done)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-surface-hi transition-colors"
        >
          {item.done
            ? <CheckCircle2 size={16} className="shrink-0 text-green-500" />
            : <Circle size={16} className="shrink-0 text-muted" />}
          <span className={cn('flex-1 truncate text-sm', item.done ? 'text-muted line-through' : 'text-ink-soft')}>
            {item.name}
          </span>
          {item.courseName && (
            <span className="shrink-0 text-xs text-muted">{item.courseName}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Music strip ──────────────────────────────────────────────────────────────────
function MusicStrip() {
  const { defaultMusicService } = useSettingsStore();
  if (!defaultMusicService) return null;
  return (
    <div className="w-[min(90vw,26rem)] overflow-hidden rounded-xl border border-line bg-surface/70 backdrop-blur">
      {defaultMusicService === 'spotify' ? <SpotifyMiniPlayer borderless /> : <AppleMusicMiniPlayer borderless />}
    </div>
  );
}

// ── Overlay ──────────────────────────────────────────────────────────────────────
export default function FocusMode() {
  const isOpen = useFocusStore(s => s.isOpen);
  const close  = useFocusStore(s => s.close);

  const phase     = useTimerStore(s => s.phase);
  const isRunning = useTimerStore(s => s.isRunning);
  const timeLeft  = useTimerStore(s => s.timeLeft);
  const focusSecs = useTimerStore(s => s.focusSecs);
  const breakSecs = useTimerStore(s => s.breakSecs);
  const longBreakSecs = useTimerStore(s => s.longBreakSecs);
  const start = useTimerStore(s => s.start);
  const pause = useTimerStore(s => s.pause);
  const reset = useTimerStore(s => s.reset);
  const awaitingReflection = useTimerStore(s => s.awaitingReflection);

  const totalSecs =
    phase === 'focus' ? focusSecs : phase === 'long_break' ? longBreakSecs : breakSecs;
  const color = PHASE_COLORS[phase];

  // Esc leaves Focus Mode. Space/R are already handled app-wide by StudyPage's
  // listener only while on that route, so add the same controls here.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el?.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') { close(); return; }
      if (typing) return;
      if (e.code === 'Space') { e.preventDefault(); if (isRunning) pause(); else start(); }
      else if (e.key === 'r' || e.key === 'R') { reset(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isRunning, pause, start, reset, close]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-bg">
      {/* Exit — quiet, top-right */}
      <button
        onClick={close}
        className="absolute right-5 top-5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-hi hover:text-ink-soft transition-colors"
      >
        <X size={15} /> Leave
      </button>

      <div className="flex min-h-full w-full flex-col items-center justify-center gap-8 px-6 py-16">
        {awaitingReflection ? (
          <ReflectionCard />
        ) : (
          <>
            <IntentionLine running={isRunning} />

            {/* Clock + ring */}
            <div className="relative flex items-center justify-center">
              <ProgressRing phase={phase} timeLeft={timeLeft} totalSecs={totalSecs} size={300} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-6xl font-semibold tabular-nums tracking-tight" style={{ color }}>
                  {formatClock(timeLeft)}
                </span>
                <span className="mt-1 text-xs uppercase tracking-wide text-muted">
                  {PHASE_LABELS[phase as Phase]}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={reset}
                title="Reset"
                className="rounded-full p-2.5 text-muted hover:bg-surface-hi hover:text-ink-soft transition-colors"
              >
                <RotateCcw size={18} />
              </button>
              <button
                onClick={isRunning ? pause : start}
                className="flex items-center gap-2 rounded-full px-9 py-3 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: color }}
              >
                {isRunning ? <Pause size={16} /> : <Play size={16} />}
                {isRunning ? 'Pause' : 'Start'}
              </button>
              <div className="w-[42px]" />
            </div>

            <FocusList />
            <MusicStrip />

            <p className="text-xs text-muted">
              <kbd className="rounded border border-line px-1.5 py-0.5 font-sans">Space</kbd>
              <span className="mx-1.5">start / pause</span>·
              <kbd className="ml-1.5 rounded border border-line px-1.5 py-0.5 font-sans">Esc</kbd>
              <span className="ml-1.5">leave</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
