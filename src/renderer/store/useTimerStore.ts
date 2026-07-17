import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';
import { useFocusStore } from './useFocusStore';
import { queryClient } from '../lib/queryClient';
import { studySessionKeys } from '../lib/queries/useStudySessions';
import { SITTING_GAP_MS } from '../../shared/studySittings';

export type Phase = 'focus' | 'short_break' | 'long_break';

export const FOCUS_OPTIONS      = [25, 30, 50, 60, 75, 90] as const;
export const BREAK_OPTIONS      = [5, 10, 15, 20, 25, 30]  as const;
export const LONG_BREAK_OPTIONS = [10, 15, 20, 25, 30]     as const;

// Classic Pomodoro: every 4th completed focus session earns a long break.
const LONG_BREAK_EVERY = 4;

// Below this, a focus block isn't study — it's a misclick or a change of mind. Skipping
// out that early logs nothing rather than littering the history with 8-second blocks.
const MIN_LOGGED_FOCUS_SECS = 60;

// Phase presentation lives here (not in a component) so the Study page, the
// sidebar chip, and the window title all agree on names and colors.
export const PHASE_LABELS: Record<Phase, string> = {
  focus:       'Focus',
  short_break: 'Break',
  long_break:  'Long break',
};

// Focus is the lamp: Lamplight Amber, the same word on every surface (the old
// muted red read as the danger family). Breaks stay in the green rest family;
// Focus Mode's GLOW map carries the brighter on-dark tones of the same hues.
export const PHASE_COLORS: Record<Phase, string> = {
  focus:       '#e2a53b',
  short_break: '#467a59',
  long_break:  '#34604a',
};

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function playChime(): void {
  if (!useSettingsStore.getState().timerSoundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.9);
  } catch {
    // Audio unavailable — silently skip
  }
}

function sendNotification(completed: Phase, next: Phase): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const isWork = completed === 'focus';
  new Notification(isWork ? 'Focus session complete' : 'Break over', {
    body: isWork
      ? (next === 'long_break' ? 'Time for a long break — you earned it.' : 'Take a short break.')
      : 'Time to focus!',
  });
}

// Persist finished focus sessions so study stats are possible later.
// Fire-and-forget: a failed write must never break the timer itself. The
// intention (if any) rides along, and the resulting session id is stashed so
// Focus Mode can prompt for a reflection on the block that just ended.
// `armReflection` — decided by the caller so the sync tick() and this async
// callback agree — pops the "How did it go?" card once the write lands.
//
// The cache invalidation is load-bearing, not housekeeping. This writes straight
// through IPC instead of via a React Query mutation, so without telling the cache,
// `useStudySessions` keeps serving the pre-session list. "Studied today" reads as
// (stale logged total + live elapsed of this block), so the moment a block ended its
// live part dropped to zero while the logged part hadn't caught up — the counter fell
// back by a whole block instead of climbing all day.
function logFocusSession(durationSeconds: number, intention: string, armReflection: boolean): void {
  window.api.studySessions
    .create({
      startedAt: new Date(Date.now() - durationSeconds * 1000).toISOString(),
      durationSeconds,
      kind: 'focus',
      intention: intention.trim() || undefined,
    })
    .then((s) => {
      queryClient.invalidateQueries({ queryKey: studySessionKeys.all });
      if (armReflection) {
        useTimerStore.setState({ lastFocusSessionId: s.id, awaitingReflection: true });
      }
    })
    .catch(() => { /* best-effort logging */ });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Timer *configuration* (durations, custom flag) persists in the main process — the
// renderer's localStorage isn't reliable across a relaunch in packaged (file://) builds.
// The live countdown snapshot below stays in localStorage: it changes every tick and is
// transient resume state, not a setting. `initialSettings` was read at preload time.
const appSettings = window.api?.app?.initialSettings ?? {};

function readSetting(key: string, legacyLsKey: string): string | null {
  if (appSettings[key] !== undefined) return appSettings[key];
  // Migrate a value still only in old localStorage forward into main.
  const legacy = localStorage.getItem(legacyLsKey);
  if (legacy !== null) window.api?.app?.setSetting(key, legacy);
  return legacy;
}

function saveSetting(key: string, value: string): void {
  window.api?.app?.setSetting(key, value);
}

function readMins(key: string, legacyLsKey: string, fallback: number): number {
  const stored = parseInt(readSetting(key, legacyLsKey) ?? '', 10);
  return isNaN(stored) ? fallback : stored;
}

function phaseSecs(phase: Phase, focusSecs: number, breakSecs: number, longBreakSecs: number): number {
  if (phase === 'focus')      return focusSecs;
  if (phase === 'long_break') return longBreakSecs;
  return breakSecs;
}

type SetTimer = (partial: Partial<TimerState>) => void;
type GetTimer = () => TimerState;

/** Seconds actually left on the clock. While running, `endsAt` is the truth —
    `timeLeft` only catches up once a second, so reading it here would round the
    user's work down by up to a second on every skip. */
function secsLeft(get: GetTimer): number {
  const { isRunning, endsAt, timeLeft } = get();
  return isRunning && endsAt != null
    ? Math.max(0, Math.round((endsAt - Date.now()) / 1000))
    : timeLeft;
}

/** Focus seconds put in on the block in progress; zero on a break. */
function workedSecs(get: GetTimer): number {
  const { phase, focusSecs } = get();
  return phase === 'focus' ? Math.max(0, focusSecs - secsLeft(get)) : 0;
}

/**
 * Leave the phase that just ended and set up the next one.
 *
 * `worked` is what the focus block earned: its full length when the clock ran out,
 * or the elapsed so far when the user skipped out early. Breaks earn nothing.
 * `announce` is false when the user drove the change by hand — they're looking right
 * at the screen, so a chime and a desktop notification would only be noise.
 *
 * tick() and skip() both route through here so "what happens when a focus block
 * ends" is written once, and the two paths can't drift apart.
 */
function leavePhase(set: SetTimer, get: GetTimer, worked: number, announce: boolean): void {
  const { phase, autoAdvance, focusSecs, breakSecs, longBreakSecs, focusCount, intention } = get();

  const patch: Partial<TimerState> = {};
  let next: Phase;
  let nextFocusCount = focusCount;
  let willReflect = false;

  if (phase === 'focus') {
    // Only a block with real work in it counts — toward the log, the cycle, and the
    // sitting. A reflection card only makes sense inside Focus Mode and only if the
    // user wants it; deciding here (once) keeps the async log callback in agreement.
    if (worked >= MIN_LOGGED_FOCUS_SECS) {
      willReflect =
        useSettingsStore.getState().reflectionPromptEnabled && useFocusStore.getState().isOpen;
      logFocusSession(worked, intention, willReflect);
      nextFocusCount = focusCount + 1;
      patch.lastBlockEndedAt = Date.now();
    }
    // A block too short to count must not earn a long break either, so the cycle
    // milestone is only checked when the count actually moved.
    next = nextFocusCount > focusCount && nextFocusCount % LONG_BREAK_EVERY === 0
      ? 'long_break'
      : 'short_break';
    // The intention belonged to the block that just ended — clear it for the next one.
    patch.intention = '';
  } else {
    next = 'focus';
  }

  if (announce) {
    playChime();
    sendNotification(phase, next);
  }

  const nextSecs = phaseSecs(next, focusSecs, breakSecs, longBreakSecs);
  // When a reflection card is about to appear, don't run the break behind it —
  // clearReflectionPrompt() releases it once the user writes or skips. Otherwise
  // auto-advance flows straight into the break as before.
  const resume = autoAdvance && !willReflect;
  set({
    ...patch,
    phase: next,
    focusCount: nextFocusCount,
    timeLeft: nextSecs,
    isRunning: resume,
    endsAt: resume ? Date.now() + nextSecs * 1000 : null,
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface TimerState {
  phase: Phase;
  isRunning: boolean;
  timeLeft: number;
  autoAdvance: boolean;
  focusSecs: number;
  breakSecs: number;
  longBreakSecs: number;
  /** Completed focus sessions in the current cycle — every 4th earns a long break. */
  focusCount: number;
  /** Wall-clock ms when the running phase ends; null when paused/stopped. */
  endsAt: number | null;
  /**
   * Wall-clock ms when the last focus block was logged; null if none this sitting.
   * The sitting gate: come back within SITTING_GAP_MS and you're still in the same
   * stretch (the cycle carries on); leave it longer and the next block starts fresh.
   */
  lastBlockEndedAt: number | null;
  /**
   * True when the user explicitly chose "Custom" on the Study page. The active
   * technique is otherwise *derived* from the durations, so this is the only
   * technique fact that needs storing — and it persists across navigation.
   */
  customTechnique: boolean;
  /** Focus Mode: the one-line intention for the current/next focus block. */
  intention: string;
  /** The session logged by the most recently completed focus block (for the reflection prompt). */
  lastFocusSessionId: string | null;
  /** True right after a focus block ends, until the user writes or skips a reflection. */
  awaitingReflection: boolean;

  setPhase: (phase: Phase) => void;
  setCustomTechnique: (v: boolean) => void;
  setIntention: (v: string) => void;
  /** Dismiss the reflection prompt (after submitting or skipping). */
  clearReflectionPrompt: () => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Move on now: log a focus block's elapsed work, or cut a break short. */
  skip: () => void;
  /** Close the current stretch by hand — log what's done, reset the cycle. */
  endSitting: () => void;
  tick: () => void;
  toggleAutoAdvance: () => void;
  setFocusMins: (mins: number) => void;
  setBreakMins: (mins: number) => void;
  setLongBreakMins: (mins: number) => void;
}

const initFocusSecs     = readMins('focusMins',     'studeo:focusMins',     25) * 60;
const initBreakSecs     = readMins('breakMins',     'studeo:breakMins',      5) * 60;
const initLongBreakSecs = readMins('longBreakMins', 'studeo:longBreakMins', 15) * 60;

// ── Restore a previous session ────────────────────────────────────────────────
// The timer state is snapshotted to localStorage on every change (subscribe at
// the bottom of this file), so a running session survives quitting the app.

interface TimerSnapshot {
  phase: Phase;
  timeLeft: number;
  isRunning: boolean;
  endsAt: number | null;
  focusCount: number;
  intention: string;
  lastBlockEndedAt: number | null;
}

function readSnapshot(): TimerSnapshot | null {
  try {
    const raw = localStorage.getItem('studeo:timerState');
    if (!raw) return null;
    const s = JSON.parse(raw) as TimerSnapshot;
    if (s.phase !== 'focus' && s.phase !== 'short_break' && s.phase !== 'long_break') return null;
    return s;
  } catch {
    return null;
  }
}

const restored = (() => {
  const fresh = {
    phase: 'focus' as Phase,
    timeLeft: initFocusSecs,
    isRunning: false,
    endsAt: null as number | null,
    focusCount: 0,
    intention: '',
    lastBlockEndedAt: null as number | null,
  };
  const s = readSnapshot();
  if (!s) return fresh;

  const focusCount = Number.isFinite(s.focusCount) ? s.focusCount : 0;
  const intention  = typeof s.intention === 'string' ? s.intention : '';
  const lastBlockEndedAt =
    typeof s.lastBlockEndedAt === 'number' ? s.lastBlockEndedAt : null;

  // Still mid-session: resume running exactly where the wall clock says.
  if (s.isRunning && typeof s.endsAt === 'number' && s.endsAt > Date.now()) {
    return {
      phase: s.phase,
      timeLeft: Math.round((s.endsAt - Date.now()) / 1000),
      isRunning: true,
      endsAt: s.endsAt,
      focusCount,
      intention,
      lastBlockEndedAt,
    };
  }

  // The phase finished while the app was closed: advance like tick() would,
  // but silently (no stale chime on launch), landing paused on the next phase.
  if (s.isRunning && typeof s.endsAt === 'number') {
    let nextCount = focusCount;
    let nextPhase: Phase;
    let nextIntention = intention;
    let nextBlockEnd = lastBlockEndedAt;
    if (s.phase === 'focus') {
      // The focus block genuinely completed — persist it with its real timestamps
      // and intention. No reflection prompt: the block ended while the app was shut.
      window.api.studySessions
        .create({
          startedAt: new Date(s.endsAt - initFocusSecs * 1000).toISOString(),
          durationSeconds: initFocusSecs,
          kind: 'focus',
          intention: intention.trim() || undefined,
        })
        .catch(() => { /* best-effort */ });
      nextCount = focusCount + 1;
      nextPhase = nextCount % LONG_BREAK_EVERY === 0 ? 'long_break' : 'short_break';
      nextIntention = '';
      // The sitting is measured from when the block really ended, not from launch —
      // reopening the app tomorrow must not revive yesterday's cycle.
      nextBlockEnd = s.endsAt;
    } else {
      nextPhase = 'focus';
    }
    return {
      phase: nextPhase,
      timeLeft: phaseSecs(nextPhase, initFocusSecs, initBreakSecs, initLongBreakSecs),
      isRunning: false,
      endsAt: null,
      focusCount: nextCount,
      intention: nextIntention,
      lastBlockEndedAt: nextBlockEnd,
    };
  }

  // Was paused: restore the remaining time as-is.
  const timeLeft = Number.isFinite(s.timeLeft) && s.timeLeft > 0
    ? s.timeLeft
    : phaseSecs(s.phase, initFocusSecs, initBreakSecs, initLongBreakSecs);
  return { phase: s.phase, timeLeft, isRunning: false, endsAt: null, focusCount, intention, lastBlockEndedAt };
})();

export const useTimerStore = create<TimerState>((set, get) => ({
  phase:       restored.phase,
  isRunning:   restored.isRunning,
  timeLeft:    restored.timeLeft,
  autoAdvance: false,
  focusSecs:     initFocusSecs,
  breakSecs:     initBreakSecs,
  longBreakSecs: initLongBreakSecs,
  focusCount:    restored.focusCount,
  endsAt:        restored.endsAt,
  lastBlockEndedAt: restored.lastBlockEndedAt,
  customTechnique: readSetting('customTechnique', 'studeo:customTechnique') === 'true',
  intention:          restored.intention,
  lastFocusSessionId: null,
  awaitingReflection: false,

  setCustomTechnique: (v) => {
    saveSetting('customTechnique', String(v));
    set({ customTechnique: v });
  },

  setIntention: (v) => set({ intention: v }),
  // Dismissing the reflection card releases the break that was held paused behind
  // it (see tick()). If auto-advance is on, that break starts now — so the pause
  // covered only the reflection beat, not the break itself.
  clearReflectionPrompt: () => {
    const { autoAdvance, isRunning, timeLeft } = get();
    if (autoAdvance && !isRunning) {
      set({ awaitingReflection: false, lastFocusSessionId: null, isRunning: true, endsAt: Date.now() + timeLeft * 1000 });
    } else {
      set({ awaitingReflection: false, lastFocusSessionId: null });
    }
  },

  setPhase: (phase) => {
    const { focusSecs, breakSecs, longBreakSecs } = get();
    set({ phase, isRunning: false, endsAt: null, timeLeft: phaseSecs(phase, focusSecs, breakSecs, longBreakSecs) });
  },

  // Anchor a wall-clock end time so the countdown survives navigation and
  // self-corrects after the OS throttles background timers (no drift).
  start: () => {
    const { timeLeft, phase, focusCount, lastBlockEndedAt } = get();
    // Sitting down again after a long enough gap starts a new sitting, so the cycle
    // begins over: three dots left from this morning shouldn't hand you a long break
    // one block into the evening. Checked on start (rather than on a background
    // timer) because that's the moment the answer can first matter.
    const staleSitting =
      phase === 'focus' &&
      focusCount > 0 &&
      lastBlockEndedAt != null &&
      Date.now() - lastBlockEndedAt > SITTING_GAP_MS;
    set({
      isRunning: true,
      endsAt: Date.now() + timeLeft * 1000,
      ...(staleSitting ? { focusCount: 0, lastBlockEndedAt: null } : {}),
    });
  },
  pause: () => {
    const { endsAt, timeLeft } = get();
    const remaining = endsAt != null ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : timeLeft;
    set({ isRunning: false, timeLeft: remaining, endsAt: null });
  },

  reset: () => {
    const { phase, focusSecs, breakSecs, longBreakSecs } = get();
    set({ isRunning: false, endsAt: null, timeLeft: phaseSecs(phase, focusSecs, breakSecs, longBreakSecs) });
  },

  // Move on without waiting out the clock: cut a break short, or call a focus block
  // done early. The minutes already put in are logged (that work happened), so the
  // day's total and the heatmap stay honest — see leavePhase.
  skip: () => leavePhase(set, get, workedSecs(get), false),

  // "I'm done for now." Bank whatever the current block earned, then clear the cycle
  // so the next block opens a fresh sitting instead of continuing this one. Note the
  // history list groups by wall-clock gap alone, so restarting within the hour still
  // reads as one stretch there — this resets the timer's cycle, not the past.
  endSitting: () => {
    const { focusSecs, intention } = get();
    const worked = workedSecs(get);
    if (worked >= MIN_LOGGED_FOCUS_SECS) logFocusSession(worked, intention, false);
    set({
      phase: 'focus',
      isRunning: false,
      endsAt: null,
      timeLeft: focusSecs,
      focusCount: 0,
      lastBlockEndedAt: null,
      intention: '',
      awaitingReflection: false,
      lastFocusSessionId: null,
    });
  },

  toggleAutoAdvance: () => set(s => ({ autoAdvance: !s.autoAdvance })),

  // Driven once a second from the app shell. Remaining time is derived from
  // endsAt rather than decremented, so a missed tick can't accumulate drift.
  tick: () => {
    const { isRunning, endsAt, focusSecs } = get();
    if (!isRunning || endsAt == null) return;
    const remaining = Math.round((endsAt - Date.now()) / 1000);
    if (remaining > 0) {
      set({ timeLeft: remaining });
      return;
    }
    // The clock ran out, so a focus block earned its full length. Announce it: the
    // user may well be looking somewhere else by now.
    leavePhase(set, get, focusSecs, true);
  },

  setFocusMins: (mins) => {
    saveSetting('focusMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ focusSecs: secs, ...(phase === 'focus' ? { timeLeft: secs, isRunning: false, endsAt: null } : {}) });
  },

  setBreakMins: (mins) => {
    saveSetting('breakMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ breakSecs: secs, ...(phase === 'short_break' ? { timeLeft: secs, isRunning: false, endsAt: null } : {}) });
  },

  setLongBreakMins: (mins) => {
    saveSetting('longBreakMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ longBreakSecs: secs, ...(phase === 'long_break' ? { timeLeft: secs, isRunning: false, endsAt: null } : {}) });
  },
}));

// Snapshot every change so a session survives quitting the app (restored above).
useTimerStore.subscribe((s) => {
  const snapshot: TimerSnapshot = {
    phase: s.phase,
    timeLeft: s.timeLeft,
    isRunning: s.isRunning,
    endsAt: s.endsAt,
    focusCount: s.focusCount,
    intention: s.intention,
    lastBlockEndedAt: s.lastBlockEndedAt,
  };
  localStorage.setItem('studeo:timerState', JSON.stringify(snapshot));
});
