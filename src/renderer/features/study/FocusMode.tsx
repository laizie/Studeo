import { useEffect, useState, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, X, CheckCircle2, Circle, Plus, Maximize, Minimize, GripHorizontal, Clock, Inbox, Volume2 } from 'lucide-react';
import {
  useTimerStore, PHASE_LABELS, PHASE_COLORS, formatClock, type Phase,
} from '../../store/useTimerStore';
import { useStudyListStore } from '../../store/useStudyListStore';
import { useParkingLotStore } from '../../store/useParkingLotStore';
import { useAmbienceStore } from '../../store/useAmbienceStore';
import { useFocusStore } from '../../store/useFocusStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUpdateAssignment } from '../../lib/queries/useAssignments';
import { useUpdateTask } from '../../lib/queries/useTasks';
import { useUpdateStudySession, useStudySessions } from '../../lib/queries/useStudySessions';
import { useCreateNote } from '../../lib/queries/useNotes';
import { focusMinutesSince, startOfDay } from '../../../shared/studyStats';
import { buildParkingLotNote } from '../../../shared/parkingLot';
import { AMBIENCE_SOUNDS } from '../../../shared/ambience';
import { ambienceEngine } from './ambience/ambienceEngine';
import AppleMusicMiniPlayer from '../applemusic/AppleMusicMiniPlayer';
import AppleMusicPlaylistsList from '../applemusic/AppleMusicPlaylistsList';
import SpotifyMiniPlayer from '../spotify/SpotifyMiniPlayer';
import SpotifyUpNext from '../spotify/SpotifyUpNext';
import ProgressRing from './ProgressRing';
import StudyPickerDialog from './StudyPickerDialog';
import { contrastTextColor } from '../../lib/colors';
import { cn } from '../../lib/utils';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { showToast } from '../../store/useToastStore';

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
  done:  '#5fa37a', // success check — the room's on-dark green
} as const;

// The lamplight. Amber while you work (the brand "Lamplight Amber"); it cools to a
// calm green on breaks, so the room itself tells you which phase you're in.
const GLOW: Record<Phase, string> = {
  focus:       '#e2a53b',
  short_break: '#5fa37a',
  long_break:  '#4f9270',
};

// A tiny, opinionated set of presets for the in-room method switch — the same three
// techniques as the Study page minus Custom, which belongs to the fuller settings there.
const METHODS = [
  { id: 'pomodoro', label: 'Pomodoro',  focus: 25, brk: 5  },
  { id: '5217',     label: '52 / 17',   focus: 52, brk: 17 },
  { id: 'deepwork', label: 'Deep Work', focus: 90, brk: 20 },
] as const;

// ── Draggable panels ─────────────────────────────────────────────────────────────
// Lets the floating rails be repositioned. We offset with left/top (not transform) so
// it doesn't fight the rails' transform-based entrance animation, and divide the cursor
// delta by the fullscreen zoom so the panel tracks the pointer 1:1. Position persists
// in localStorage; double-clicking the grip resets it.
//
// Crucially, the offset is *clamped to the viewport* so a rail can never be dragged so
// far that its grip leaves the screen (and so becomes un-grabbable). We also raise the
// panel's z-index while dragging so overlapping the clock can never bury its handle.
interface Offset { x: number; y: number }

function readOffset(key: string): Offset {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) as Offset; } catch { /* ignore */ }
  return { x: 0, y: 0 };
}

function clampNum(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));
}

// ── Viewport scale ────────────────────────────────────────────────────────────────
// The whole room scales with the window — bigger window, bigger room — rather than only
// snapping bigger on OS fullscreen (fullscreen is just the largest window, so it's
// covered too). Both dimensions are measured so the scale "fits" the window; rounding to
// a 0.05 step keeps the CSS zoom crisp and stops it jittering on drag-resize.
function computeViewportScale(): number {
  const w = window.visualViewport?.width  ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const raw = Math.min(w / 1280, h / 820);
  return clampNum(Math.round(raw * 20) / 20, 1, 1.35);
}

function useViewportScale(): number {
  const [scale, setScale] = useState(computeViewportScale);
  useEffect(() => {
    // A bare `resize` listener misses moves between monitors of a different resolution or
    // pixel-ratio (the window's size can change with no `resize`, and a DPR change never
    // fires one). So we also watch the visualViewport and re-arm a media query for the
    // *current* devicePixelRatio after every change — catching each subsequent screen hop.
    let dpr: MediaQueryList | null = null;
    function update() {
      setScale(computeViewportScale());
      dpr?.removeEventListener('change', update);
      dpr = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dpr.addEventListener('change', update);
    }
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      dpr?.removeEventListener('change', update);
    };
  }, []);
  return scale;
}

function useDraggable(storageKey: string, scale: number) {
  const [offset, setOffset]     = useState<Offset>(() => readOffset(storageKey));
  const [dragging, setDragging] = useState(false);
  const ref    = useRef<HTMLElement | null>(null);
  const drag   = useRef<{ px: number; py: number; ox: number; oy: number; bx: number; by: number; w: number; h: number } | null>(null);
  const latest = useRef<Offset>(offset);

  // Keep `value` so the panel stays fully on-screen (with an 8px margin), given the
  // element's un-offset top-left `base` and size — all in rendered (post-zoom) px.
  function clampAxis(value: number, base: number, size: number, viewport: number): number {
    const M = 8;
    const lo = (M - base) / scale;                       // don't cross the near edge
    const hi = (viewport - M - size - base) / scale;      // don't cross the far edge
    return clampNum(value, lo, hi);
  }

  function onPointerDown(e: React.PointerEvent) {
    const rect = ref.current?.getBoundingClientRect();
    drag.current = {
      px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y,
      // base = where the element sits with zero offset (strip the current offset back out)
      bx: rect ? rect.left - offset.x * scale : 0,
      by: rect ? rect.top  - offset.y * scale : 0,
      w:  rect?.width  ?? 0,
      h:  rect?.height ?? 0,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const next = {
      x: clampAxis(d.ox + (e.clientX - d.px) / scale, d.bx, d.w, window.innerWidth),
      y: clampAxis(d.oy + (e.clientY - d.py) / scale, d.by, d.h, window.innerHeight),
    };
    latest.current = next;
    setOffset(next);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    try { localStorage.setItem(storageKey, JSON.stringify(latest.current)); } catch { /* ignore */ }
  }
  function reset() {
    latest.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }

  // A saved position can fall off-screen if the window shrinks or fullscreen toggles
  // (the layout shifts). Re-clamp on mount, on those changes, and on resize so the
  // panel is always reachable, never stranded past an edge.
  useEffect(() => {
    function clampToView() {
      const el = ref.current;
      if (!el || drag.current) return;
      setOffset(prev => {
        const rect = el.getBoundingClientRect();
        const bx = rect.left - prev.x * scale;
        const by = rect.top  - prev.y * scale;
        const next = {
          x: clampAxis(prev.x, bx, rect.width,  window.innerWidth),
          y: clampAxis(prev.y, by, rect.height, window.innerHeight),
        };
        if (next.x === prev.x && next.y === prev.y) return prev;
        latest.current = next;
        return next;
      });
    }
    clampToView();
    window.addEventListener('resize', clampToView);
    return () => window.removeEventListener('resize', clampToView);
  }, [scale]);

  return { offset, dragging, reset, ref, handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

// The grip that turns a rail into a draggable panel.
function DragHandle({ handleProps, onReset }: { handleProps: React.HTMLAttributes<HTMLDivElement>; onReset: () => void }) {
  return (
    <div
      {...handleProps}
      onDoubleClick={onReset}
      title="Drag to move · double-click to reset"
      className="mb-1 flex cursor-grab touch-none select-none items-center justify-center rounded-md py-0.5 transition-colors hover:bg-white/[0.05] active:cursor-grabbing"
    >
      <GripHorizontal size={15} style={{ color: ROOM.muted }} />
    </div>
  );
}

// ── Method switch (simple) ───────────────────────────────────────────────────────
// Three preset chips. Picking one applies its focus/break durations (which resets the
// current phase's countdown, same as on the Study page) and clears the Custom flag.
function MethodSwitcher() {
  const focusSecs          = useTimerStore(s => s.focusSecs);
  const breakSecs          = useTimerStore(s => s.breakSecs);
  const setFocusMins       = useTimerStore(s => s.setFocusMins);
  const setBreakMins       = useTimerStore(s => s.setBreakMins);
  const setCustomTechnique = useTimerStore(s => s.setCustomTechnique);

  const fMin = Math.round(focusSecs / 60);
  const bMin = Math.round(breakSecs / 60);

  function apply(m: (typeof METHODS)[number]) {
    setCustomTechnique(false);
    setFocusMins(m.focus);
    setBreakMins(m.brk);
  }

  return (
    <div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: '#ffffff0d' }}>
      {METHODS.map(m => {
        const active = fMin === m.focus && bMin === m.brk;
        return (
          <button
            key={m.id}
            onClick={() => apply(m)}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={active ? { backgroundColor: ROOM.line, color: ROOM.ink } : { color: ROOM.muted }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = ROOM.soft; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = ROOM.muted; }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Total studied today (corner) ─────────────────────────────────────────────────
// Logged focus time today plus the live elapsed of the block in progress, so it ticks
// like a stopwatch while you work and holds steady on breaks.
function formatHms(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function TotalStudyToday() {
  const { data: sessions = [] } = useStudySessions();
  const phase     = useTimerStore(s => s.phase);
  const timeLeft  = useTimerStore(s => s.timeLeft);
  const focusSecs = useTimerStore(s => s.focusSecs);

  const loggedSec = useMemo(
    () => Math.round(focusMinutesSince(sessions, startOfDay(new Date())) * 60),
    [sessions],
  );
  // Elapsed of the block in progress. Counted whenever we're in a focus phase (not only
  // while running) so pausing holds the total steady instead of dropping the elapsed and
  // snapping it back on resume. It's only added to the logged total once the block ends.
  const liveSec = phase === 'focus' ? Math.max(0, focusSecs - timeLeft) : 0;

  return (
    <div className="flex items-center gap-2" style={{ color: ROOM.muted }}>
      <Clock size={14} />
      <span className="text-sm font-medium tabular-nums" style={{ color: ROOM.soft }}>{formatHms(loggedSec + liveSec)}</span>
      <span className="text-xs">studied today</span>
    </div>
  );
}

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

// ── Distraction parking lot ──────────────────────────────────────────────────────
// A tiny field for intrusive thoughts ("reply to mom", "look up that thing"). Park
// them here instead of chasing them; on leaving the room they dump into a loose note
// (see FocusMode.leave). Complements the intention (before) / reflection (after) pair.
// Pinned bottom-centre so it's one keystroke away — press "P" to jump straight in.
function ParkingDock({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const items  = useParkingLotStore(s => s.items);
  const add    = useParkingLotStore(s => s.add);
  const remove = useParkingLotStore(s => s.remove);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  function commit() {
    if (!text.trim()) return;
    add(text);
    setText('');
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Review panel — expand the count to fix a typo or drop a thought. */}
      {open && items.length > 0 && (
        <div
          className="w-72 max-h-48 space-y-0.5 overflow-y-auto rounded-xl border p-1.5 shadow-2xl backdrop-blur-md"
          style={{ borderColor: ROOM.line, backgroundColor: 'rgba(28, 20, 14, 0.9)' }}
        >
          {items.map(i => (
            <div key={i.id} className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.04]">
              <span className="flex-1 truncate text-left text-sm" style={{ color: ROOM.soft }}>{i.text}</span>
              <button
                onClick={() => remove(i.id)}
                aria-label={`Remove "${i.text}"`}
                title="Remove"
                className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-white/[0.08] group-hover:opacity-100"
                style={{ color: ROOM.muted }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The tiny field. */}
      <div
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-lg backdrop-blur-md"
        style={{ borderColor: ROOM.line, backgroundColor: 'rgba(28, 20, 14, 0.6)' }}
      >
        <Inbox size={14} className="shrink-0" style={{ color: ROOM.muted }} />
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            // Esc clears the field rather than leaving the room — but only when there's
            // something to clear, so an empty field still lets Esc exit as usual.
            else if (e.key === 'Escape' && text) { e.stopPropagation(); setText(''); e.currentTarget.blur(); }
          }}
          placeholder="Park a distraction…"
          aria-label="Park a distraction"
          className="w-52 bg-transparent text-sm outline-none placeholder:opacity-60"
          style={{ color: ROOM.ink }}
        />
        {items.length > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            title={open ? 'Hide parked thoughts' : 'Review parked thoughts'}
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums transition-colors hover:bg-white/[0.08]"
            style={{ color: ROOM.muted, backgroundColor: '#ffffff0d' }}
          >
            {items.length} parked
          </button>
        )}
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
        <p className="text-caption font-medium uppercase tracking-wider" style={{ color: ROOM.muted }}>
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
                  ? <CheckCircle2 size={16} style={{ color: ROOM.done }} />
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

// ── Ambience controls ──────────────────────────────────────────────────────────────
// Bundled ambient sound, synthesized on the fly (no files, no network, no Spotify).
// Pick a texture to start it; pick it again to stop. Volume persists; the selection
// resets each visit so the room opens quiet. The audio graph lives in ambienceEngine.
function AmbienceControls() {
  const activeId  = useAmbienceStore(s => s.activeId);
  const volume    = useAmbienceStore(s => s.volume);
  const toggle    = useAmbienceStore(s => s.toggle);
  const setVolume = useAmbienceStore(s => s.setVolume);

  return (
    <div>
      <p className="mb-2 px-3 text-caption font-medium uppercase tracking-wider" style={{ color: ROOM.muted }}>
        Ambience
      </p>
      <div className="flex flex-wrap gap-1.5 px-1">
        {AMBIENCE_SOUNDS.map(s => {
          const active = activeId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              title={s.description}
              aria-pressed={active}
              className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
              style={active
                ? { backgroundColor: GLOW.focus, borderColor: GLOW.focus, color: '#1e1208' }
                : { borderColor: ROOM.line, color: ROOM.muted }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {activeId && (
        <div className="mt-3 flex items-center gap-2 px-2">
          <Volume2 size={14} className="shrink-0" style={{ color: ROOM.muted }} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            aria-label="Ambience volume"
            className="h-1 flex-1 cursor-pointer"
            style={{ accentColor: GLOW.focus }}
          />
        </div>
      )}
    </div>
  );
}

// ── Music sidebar ─────────────────────────────────────────────────────────────────
// Ambience sits on top (always available — no service needed); below it, the music
// service's now-playing card and, for Spotify, the upcoming queue ("Up next").
function MusicSidebar() {
  const { defaultMusicService, nowPlayingOnly } = useSettingsStore();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AmbienceControls />
      <div className="my-4 border-t" style={{ borderColor: ROOM.line }} />
      <p className="mb-2 px-3 text-caption font-medium uppercase tracking-wider" style={{ color: ROOM.muted }}>
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
          {!nowPlayingOnly && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {defaultMusicService === 'spotify' ? <SpotifyUpNext /> : <AppleMusicPlaylistsList />}
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
  const parkingInputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const createNote = useCreateNote();

  // The room covers the whole app, so keep Tab inside it — without a trap,
  // keyboard focus walks "out the back" into the hidden page underneath.
  useFocusTrap(isOpen, overlayRef);

  const ambienceActive = useAmbienceStore(s => s.activeId);
  const ambienceVolume = useAmbienceStore(s => s.volume);
  const stopAmbience   = useAmbienceStore(s => s.stop);
  // True OS fullscreen, driven from the main process (BrowserWindow.setFullScreen) so
  // the window chrome / title bar is genuinely gone — like the Apple Music or Spotify
  // full-screen player. The HTML Fullscreen API alone can leave the title bar visible.
  const [isFullscreen, setIsFullscreen] = useState(false);

  const totalSecs =
    phase === 'focus' ? focusSecs : phase === 'long_break' ? longBreakSecs : breakSecs;
  const color = PHASE_COLORS[phase];
  const glow  = GLOW[phase];

  // The scene scales with the window size; the drag math divides the cursor delta by it
  // so a dragged rail still tracks the pointer 1:1.
  const zoom = useViewportScale();
  const leftRail  = useDraggable('studeo:focusRail:list',  zoom);
  const rightRail = useDraggable('studeo:focusRail:music', zoom);

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

  // Ambience: drive the Web Audio engine from the store. Volume first so the engine
  // knows the target level before a play ramps to it. Selection starts null, so
  // nothing plays until the user picks a texture.
  useEffect(() => { ambienceEngine.setVolume(ambienceVolume); }, [ambienceVolume]);
  useEffect(() => {
    if (ambienceActive) ambienceEngine.play(ambienceActive);
    else ambienceEngine.stop();
  }, [ambienceActive]);

  // Leaving the room also drops out of OS fullscreen, so the app returns windowed.
  // As the sitting ends, dump any parked distractions into a loose note. We read the
  // store fresh via getState() so the Esc-key path (whose closure can be a render or
  // two stale) still flushes the current list, not an old one.
  function leave() {
    const { items, clear } = useParkingLotStore.getState();
    const note = buildParkingLotNote(items.map(i => i.text));
    if (note) {
      // Say where the parked thoughts went — a safety net the user can't see
      // is one they'll assume doesn't exist ("did I lose that?").
      createNote.mutate(note, {
        onSuccess: () => showToast('Parked thoughts saved to Notes'),
      });
      clear();
    }
    stopAmbience(); // silence ambience and reset the selection for next time
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
      else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); parkingInputRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isRunning, pickerOpen, pause, start, reset]);

  if (!isOpen) return null;

  // The scene scales up as one unit (clock, rails, type, art) via CSS zoom — simpler and
  // more uniform than tuning a dozen sizes, and it keeps the layout's proportions
  // identical at every window size. Rails cap their height *before* zoom so they stay on
  // screen at any scale.
  const ringSize  = 336;
  const clockText = 'text-7xl';
  const glowSize  = 'h-[460px] w-[460px] blur-[80px]';
  const heroGap   = 'gap-9';
  const railMaxHeight = `${78 / zoom}vh`;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Focus Mode"
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

      {/* Total studied today — quiet, bottom-left corner */}
      {!awaitingReflection && (
        <div className="absolute bottom-5 left-6 z-10">
          <TotalStudyToday />
        </div>
      )}

      {/* Distraction parking lot — quiet, bottom-centre. Hidden during the reflection
          beat so that moment stays clean. */}
      {!awaitingReflection && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <ParkingDock inputRef={parkingInputRef} />
        </div>
      )}

      {awaitingReflection ? (
        <div className="my-auto flex w-full flex-col items-center justify-center px-6 py-16" style={{ zoom }}>
          <ReflectionCard />
        </div>
      ) : (
        // Three columns: focus-list rail · clock · music rail. The rails float as glass
        // cards beside the clock (not edge-attached), and the whole scene scales with the
        // window. The clock stays dead-centre because both rails share a width; below lg
        // they stack under it so a narrow window never squeezes the ring.
        <div className="my-auto flex w-full flex-col lg:flex-row lg:items-center" style={{ zoom }}>
          {/* Left rail — focus list */}
          <aside
            ref={leftRail.ref}
            className="focus-rise relative order-2 m-4 flex w-full max-w-md flex-col self-center rounded-2xl border px-4 py-5 shadow-2xl backdrop-blur-md lg:order-1 lg:m-5 lg:w-72 lg:max-w-none xl:w-80"
            style={{ borderColor: ROOM.line, backgroundColor: 'rgba(28, 20, 14, 0.55)', left: leftRail.offset.x, top: leftRail.offset.y, zIndex: leftRail.dragging ? 30 : 20, maxHeight: railMaxHeight }}
          >
            <DragHandle handleProps={leftRail.handleProps} onReset={leftRail.reset} />
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
                  className="flex items-center gap-2 rounded-full px-10 py-3.5 text-sm font-medium transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: color, color: contrastTextColor(color), boxShadow: `0 8px 30px ${color}55` }}
                >
                  {isRunning ? <Pause size={16} /> : <Play size={16} />}
                  {isRunning ? 'Pause' : 'Start'}
                </button>
                <div className="w-[42px]" />
              </div>

              <MethodSwitcher />

              <p className="text-xs" style={{ color: ROOM.muted }}>
                <kbd className="rounded border px-1.5 py-0.5 font-sans" style={{ borderColor: ROOM.line }}>Space</kbd>
                <span className="mx-1.5">start / pause</span>·
                <kbd className="ml-1.5 rounded border px-1.5 py-0.5 font-sans" style={{ borderColor: ROOM.line }}>R</kbd>
                <span className="mx-1.5">reset</span>·
                <kbd className="ml-1.5 rounded border px-1.5 py-0.5 font-sans" style={{ borderColor: ROOM.line }}>P</kbd>
                <span className="mx-1.5">park a thought</span>·
                <kbd className="ml-1.5 rounded border px-1.5 py-0.5 font-sans" style={{ borderColor: ROOM.line }}>Esc</kbd>
                <span className="ml-1.5">leave</span>
              </p>
            </div>
          </div>

          {/* Right rail — music */}
          <aside
            ref={rightRail.ref}
            className="focus-rise relative order-3 m-4 flex w-full max-w-md flex-col self-center rounded-2xl border px-4 py-5 shadow-2xl backdrop-blur-md lg:m-5 lg:w-72 lg:max-w-none xl:w-80"
            style={{ borderColor: ROOM.line, backgroundColor: 'rgba(28, 20, 14, 0.55)', animationDelay: '0.1s', left: rightRail.offset.x, top: rightRail.offset.y, zIndex: rightRail.dragging ? 30 : 20, maxHeight: railMaxHeight }}
          >
            <DragHandle handleProps={rightRail.handleProps} onReset={rightRail.reset} />
            <MusicSidebar />
          </aside>
        </div>
      )}

      <StudyPickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
