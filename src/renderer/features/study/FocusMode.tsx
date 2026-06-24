import { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, X, CheckCircle2, Circle, Plus, Maximize, Minimize } from 'lucide-react';
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
import SpotifyUpNext from '../spotify/SpotifyUpNext';
import ProgressRing from './ProgressRing';
import StudyPickerDialog from './StudyPickerDialog';
import { cn } from '../../lib/utils';

// ── The room ────────────────────────────────────────────────────────────────────
// Focus Mode dims the lights regardless of the app theme: a fixed warm-dark palette
// so the experience is consistent and low-stim. Named here, not pulled from theme
// tokens (those flip bright in the light theme and would wash out on the dark room).
const ROOM = {
  ink:   '#f0e0cc', // hero text — warm cream
  soft:  '#d8c5ab', // intention echo, secondary
  muted: '#a08a6e', // meta, hints
  line:  '#3a2c1e', // hairlines, input wells
  well:  '#160f0a', // input background
  card:  '#1f1710', // reflection card
} as const;

// The lamplight. Amber while you work (the brand "Lamplight Amber"); it cools to a
// calm green on breaks, so the room itself tells you which phase you're in.
const GLOW: Record<Phase, string> = {
  focus:       '#e2a53b',
  short_break: '#5fa37a',
  long_break:  '#4f9270',
};

// ── Intention line ─────────────────────────────────────────────────────────────
// Before a block, an open invitation: "I'm here to ___". Once running we stop
// competing for attention and settle it into a quiet, journal-like serif line.
function IntentionLine({ running }: { running: boolean }) {
  const intention    = useTimerStore(s => s.intention);
  const setIntention = useTimerStore(s => s.setIntention);

  if (running) {
    return (
      <p className="min-h-[1.75rem] text-center text-lg" style={{ color: ROOM.muted }}>
        {intention.trim()
          ? <>I'm here to <span className="font-serif italic" style={{ color: ROOM.soft }}>{intention.trim()}</span></>
          : <span className="font-serif italic">In focus</span>}
      </p>
    );
  }

  return (
    <label className="flex items-baseline justify-center gap-2 text-base" style={{ color: ROOM.muted }}>
      <span className="shrink-0">I'm here to</span>
      <input
        type="text"
        value={intention}
        onChange={e => setIntention(e.target.value)}
        placeholder="…name one thing"
        aria-label="Session intention"
        className="w-[min(60vw,22rem)] border-b bg-transparent pb-0.5 text-center font-serif italic outline-none transition-colors"
        style={{ color: ROOM.soft, borderColor: ROOM.line }}
        onFocus={e => (e.currentTarget.style.borderColor = GLOW.focus)}
        onBlur={e => (e.currentTarget.style.borderColor = ROOM.line)}
      />
    </label>
  );
}

// ── Cycle dots ───────────────────────────────────────────────────────────────────
// Classic Pomodoro earns a long break every fourth focus block. These four dots show
// where you are in the current cycle — real progress, not decoration.
function CycleDots({ color }: { color: string }) {
  const focusCount = useTimerStore(s => s.focusCount);
  const filled = focusCount === 0 ? 0 : (focusCount % 4 || 4);
  return (
    <div className="flex items-center gap-2" aria-label={`${filled} of 4 focus blocks this cycle`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full transition-colors"
          style={{ backgroundColor: i < filled ? color : '#ffffff1a' }}
        />
      ))}
    </div>
  );
}

// ── Reflection card ─────────────────────────────────────────────────────────────
// Shown the moment a focus block ends: one quiet line to close the loop. Submitting
// saves it onto the just-logged session; skipping just dismisses.
function ReflectionCard() {
  const lastFocusSessionId    = useTimerStore(s => s.lastFocusSessionId);
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
    <div
      className="focus-rise w-[min(90vw,29rem)] rounded-2xl border px-9 py-8 text-center shadow-2xl"
      style={{ backgroundColor: ROOM.card, borderColor: ROOM.line }}
    >
      <p className="font-serif text-2xl" style={{ color: ROOM.ink }}>That's one block done.</p>
      <p className="mt-1.5 text-sm" style={{ color: ROOM.muted }}>How did it go? <span className="opacity-70">(optional)</span></p>
      <input
        type="text"
        value={text}
        autoFocus
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="e.g. Slow start, but finished the outline"
        aria-label="Session reflection"
        className="mt-5 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors"
        style={{ backgroundColor: ROOM.well, borderColor: ROOM.line, color: ROOM.ink }}
        onFocus={e => (e.currentTarget.style.borderColor = GLOW.focus)}
        onBlur={e => (e.currentTarget.style.borderColor = ROOM.line)}
      />
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={clearReflectionPrompt}
          className="px-4 py-2 text-sm transition-colors hover:opacity-100"
          style={{ color: ROOM.muted }}
        >
          Skip
        </button>
        <button
          onClick={submit}
          className="rounded-lg px-5 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: GLOW.focus, color: '#1e1208' }}
        >
          Save reflection
        </button>
      </div>
    </div>
  );
}

// ── Focus list (compact, checkable, editable) ───────────────────────────────────
// You can check items off, drop ones you're done thinking about, and add more —
// all without leaving the room (the picker opens above the overlay).
function FocusList({ onAdd }: { onAdd: () => void }) {
  const { items, toggleDone, removeItem } = useStudyListStore();
  const updateAssignment = useUpdateAssignment();
  const updateTask       = useUpdateTask();

  function handleToggle(id: string, type: 'assignment' | 'task', currentlyDone: boolean) {
    toggleDone(id);
    const status = currentlyDone ? 'not_started' : 'completed';
    if (type === 'assignment') updateAssignment.mutate({ id, input: { status } });
    else                       updateTask.mutate({ id, input: { status } });
  }

  const doneCount = items.filter(i => i.done).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-3">
        <p className="text-[0.7rem] font-medium uppercase tracking-wider" style={{ color: ROOM.muted }}>
          On your list{items.length > 0 && <span className="ml-1.5 normal-case tracking-normal opacity-80">{doneCount}/{items.length}</span>}
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-white/[0.06]"
          style={{ color: ROOM.muted }}
          onMouseEnter={e => (e.currentTarget.style.color = ROOM.ink)}
          onMouseLeave={e => (e.currentTarget.style.color = ROOM.muted)}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {items.length === 0 ? (
        <button
          onClick={onAdd}
          className="mx-1 mt-1 rounded-lg border border-dashed py-6 text-center text-xs transition-colors hover:bg-white/[0.03]"
          style={{ borderColor: ROOM.line, color: ROOM.muted }}
        >
          Pick what you're working on
        </button>
      ) : (
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {items.map(item => (
            <div
              key={item.id}
              className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
            >
              <button
                onClick={() => handleToggle(item.id, item.type, item.done)}
                className="shrink-0 transition-transform hover:scale-110"
                title={item.done ? 'Mark incomplete' : 'Mark complete'}
              >
                {item.done
                  ? <CheckCircle2 size={16} style={{ color: '#5fa37a' }} />
                  : <Circle size={16} style={{ color: ROOM.muted }} />}
              </button>
              <span
                className={cn('flex-1 truncate text-left text-sm', item.done && 'line-through')}
                style={{ color: item.done ? ROOM.muted : ROOM.soft }}
              >
                {item.name}
              </span>
              {item.courseName && (
                <span className="shrink-0 text-xs" style={{ color: ROOM.muted }}>{item.courseName}</span>
              )}
              <button
                onClick={() => removeItem(item.id)}
                aria-label={`Remove ${item.name}`}
                title="Remove from list"
                className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-white/[0.08] group-hover:opacity-100"
                style={{ color: ROOM.muted }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Music sidebar ─────────────────────────────────────────────────────────────────
// Now-playing card at the top; for Spotify the upcoming queue ("Up next") sits under
// it and scrolls. Apple Music can't expose its queue, so it shows the player alone.
function MusicSidebar() {
  const { defaultMusicService } = useSettingsStore();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 px-3 text-[0.7rem] font-medium uppercase tracking-wider" style={{ color: ROOM.muted }}>
        Music
      </p>
      {!defaultMusicService ? (
        <p className="mx-1 rounded-lg border border-dashed px-3 py-6 text-center text-xs leading-relaxed" style={{ borderColor: ROOM.line, color: ROOM.muted }}>
          Pick Spotify or Apple Music in Settings to play it here.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="overflow-hidden rounded-xl border"
            style={{ backgroundColor: '#ffffff08', borderColor: ROOM.line }}
          >
            {defaultMusicService === 'spotify' ? <SpotifyMiniPlayer borderless /> : <AppleMusicMiniPlayer borderless />}
          </div>
          {defaultMusicService === 'spotify' && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <SpotifyUpNext />
            </div>
          )}
        </div>
      )}
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

  const [pickerOpen, setPickerOpen] = useState(false);
  // True OS fullscreen, driven from the main process (BrowserWindow.setFullScreen) so
  // the window chrome / title bar is genuinely gone — like the Apple Music or Spotify
  // full-screen player. The HTML Fullscreen API alone can leave the title bar visible.
  const [isFullscreen, setIsFullscreen] = useState(false);

  const totalSecs =
    phase === 'focus' ? focusSecs : phase === 'long_break' ? longBreakSecs : breakSecs;
  const color = PHASE_COLORS[phase];
  const glow  = GLOW[phase];

  // Read the current state on open, then track every change — including the OS-driven
  // exits the renderer can't initiate (Esc, the green button, Ctrl+Cmd+F).
  useEffect(() => {
    let active = true;
    window.api.app.isFullscreen().then(v => { if (active) setIsFullscreen(v); });
    const off = window.api.app.onFullscreenChange(setIsFullscreen);
    return () => { active = false; off(); };
  }, []);

  function toggleFullscreen() {
    window.api.app.setFullscreen(!isFullscreen);
  }

  // Leaving the room also drops out of OS fullscreen, so the app returns windowed.
  function leave() {
    if (isFullscreen) window.api.app.setFullscreen(false);
    close();
  }

  // Esc leaves Focus Mode; Space/R mirror the Study page's keyboard controls. While
  // the picker is open it owns the keyboard (its own Esc closes just the picker).
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (pickerOpen) return;
      const el = e.target as HTMLElement | null;
      const typing = el?.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') { leave(); return; }
      if (typing) return;
      if (e.code === 'Space') { e.preventDefault(); if (isRunning) pause(); else start(); }
      else if (e.key === 'r' || e.key === 'R') { reset(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isRunning, pickerOpen, pause, start, reset]);

  if (!isOpen) return null;

  // Fullscreen gives the room far more space, so the whole scene scales up as one unit
  // (clock, rails, type, art) via CSS zoom — simpler and more uniform than tuning a
  // dozen sizes, and it keeps the layout's proportions identical to the windowed view.
  const zoom      = isFullscreen ? 1.2 : 1;
  const ringSize  = 336;
  const clockText = 'text-7xl';
  const glowSize  = 'h-[460px] w-[460px] blur-[80px]';
  const heroGap   = 'gap-9';

  return (
    <div
      className="focus-overlay fixed inset-0 z-50 flex flex-col items-center overflow-y-auto"
      style={{ background: 'radial-gradient(125% 95% at 50% 36%, #241a12 0%, #160f0a 55%, #0c0806 100%)' }}
    >
      {/* Window controls — quiet, top-right */}
      <div className="absolute right-5 top-5 z-10 flex items-center gap-1">
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="rounded-lg p-2 transition-colors hover:bg-white/[0.06]"
          style={{ color: ROOM.muted }}
          onMouseEnter={e => (e.currentTarget.style.color = ROOM.ink)}
          onMouseLeave={e => (e.currentTarget.style.color = ROOM.muted)}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button
          onClick={leave}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/[0.06]"
          style={{ color: ROOM.muted }}
          onMouseEnter={e => (e.currentTarget.style.color = ROOM.ink)}
          onMouseLeave={e => (e.currentTarget.style.color = ROOM.muted)}
        >
          <X size={15} /> Leave
        </button>
      </div>

      {awaitingReflection ? (
        <div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-16" style={{ zoom }}>
          <ReflectionCard />
        </div>
      ) : (
        // Three columns: focus-list rail · clock · music rail. The rails float as glass
        // cards beside the clock (not edge-attached), and the whole scene zooms up in
        // fullscreen. The clock stays dead-centre because both rails share a width;
        // below lg they stack under it so a narrow window never squeezes the ring.
        <div className="flex min-h-full w-full flex-col lg:flex-row lg:items-center" style={{ zoom }}>
          {/* Left rail — focus list */}
          <aside
            className="focus-rise order-2 m-4 flex max-h-[80vh] w-full max-w-md flex-col self-center rounded-2xl border px-4 py-5 shadow-2xl backdrop-blur-md lg:order-1 lg:m-5 lg:w-72 lg:max-w-none xl:w-80"
            style={{ borderColor: ROOM.line, backgroundColor: 'rgba(28, 20, 14, 0.55)' }}
          >
            <FocusList onAdd={() => setPickerOpen(true)} />
          </aside>

          {/* Centre — the hero */}
          <div className={cn('order-1 flex flex-1 flex-col items-center justify-center px-6 py-16 lg:order-2', heroGap)}>
            <div className={cn('flex flex-col items-center', heroGap)}>
              <IntentionLine running={isRunning} />

              {/* Clock in a pool of lamplight */}
              <div className="relative flex items-center justify-center">
                <div
                  aria-hidden
                  className={cn('pointer-events-none absolute rounded-full', glowSize, isRunning && 'focus-breathe')}
                  style={{
                    background: `radial-gradient(circle, ${glow}66 0%, ${glow}24 42%, transparent 70%)`,
                    opacity: isRunning ? undefined : 0.4,
                  }}
                />
                <ProgressRing
                  phase={phase}
                  timeLeft={timeLeft}
                  totalSecs={totalSecs}
                  size={ringSize}
                  trackColor={ROOM.line}
                  className="relative -rotate-90"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn('font-semibold tabular-nums tracking-tight', clockText)} style={{ color: ROOM.ink }}>
                    {formatClock(timeLeft)}
                  </span>
                  <span className="mt-3 text-xs font-medium uppercase tracking-[0.2em]" style={{ color }}>
                    {PHASE_LABELS[phase as Phase]}
                  </span>
                </div>
              </div>

              <CycleDots color={color} />

              {/* Controls */}
              <div className="flex items-center gap-4">
                <button
                  onClick={reset}
                  title="Reset"
                  className="rounded-full p-2.5 transition-colors hover:bg-white/[0.06]"
                  style={{ color: ROOM.muted }}
                  onMouseEnter={e => (e.currentTarget.style.color = ROOM.ink)}
                  onMouseLeave={e => (e.currentTarget.style.color = ROOM.muted)}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  onClick={isRunning ? pause : start}
                  className="flex items-center gap-2 rounded-full px-10 py-3.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: color, boxShadow: `0 8px 30px ${color}55` }}
                >
                  {isRunning ? <Pause size={16} /> : <Play size={16} />}
                  {isRunning ? 'Pause' : 'Start'}
                </button>
                <div className="w-[42px]" />
              </div>

              <p className="text-xs" style={{ color: ROOM.muted }}>
                <kbd className="rounded border px-1.5 py-0.5 font-sans" style={{ borderColor: ROOM.line }}>Space</kbd>
                <span className="mx-1.5">start / pause</span>·
                <kbd className="ml-1.5 rounded border px-1.5 py-0.5 font-sans" style={{ borderColor: ROOM.line }}>Esc</kbd>
                <span className="ml-1.5">leave</span>
              </p>
            </div>
          </div>

          {/* Right rail — music */}
          <aside
            className="focus-rise order-3 m-4 flex max-h-[80vh] w-full max-w-md flex-col self-center rounded-2xl border px-4 py-5 shadow-2xl backdrop-blur-md lg:m-5 lg:w-72 lg:max-w-none xl:w-80"
            style={{ borderColor: ROOM.line, backgroundColor: 'rgba(28, 20, 14, 0.55)', animationDelay: '0.1s' }}
          >
            <MusicSidebar />
          </aside>
        </div>
      )}

      <StudyPickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
