import { ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { IPC } from '../../shared/types';
import type { MiniTimerCommand, MiniTimerState, Phase } from '../../shared/pomodoro';
import {
  openTimerWindow,
  closeTimerWindow,
  toggleTimerWindow,
  isTimerWindowOpen,
  publishTimerState,
  getCachedTimerState,
  getOwnerWindow,
  getTimerWindow,
} from '../timerWindow';

// IPC for the floating Pomodoro pop-out. Window management on one side, a two-way
// state relay on the other; timerWindow.ts holds the window itself and explains the
// design. This file's job is the boundary: every payload arriving here came from a
// renderer, so nothing is trusted until it's been checked.

const PHASES: readonly Phase[] = ['focus', 'short_break', 'long_break'];
const COMMANDS: readonly MiniTimerCommand[] = ['start', 'pause', 'skip'];

/**
 * Validate a published snapshot.
 *
 * It's forwarded straight into another window's UI, so a malformed one wouldn't throw
 * here — it would render as `NaN:NaN` in the corner of the screen with nothing to
 * explain it. Rejecting at the boundary keeps that impossible.
 */
function parseState(value: unknown): MiniTimerState | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (!PHASES.includes(s.phase as Phase)) return null;
  if (typeof s.isRunning !== 'boolean') return null;
  if (typeof s.timeLeft !== 'number' || !Number.isFinite(s.timeLeft)) return null;
  if (s.endsAt !== null && (typeof s.endsAt !== 'number' || !Number.isFinite(s.endsAt))) return null;
  if (typeof s.totalSecs !== 'number' || !Number.isFinite(s.totalSecs)) return null;
  if (typeof s.focusCount !== 'number' || !Number.isFinite(s.focusCount)) return null;
  return {
    phase: s.phase as Phase,
    isRunning: s.isRunning,
    timeLeft: s.timeLeft,
    endsAt: s.endsAt as number | null,
    totalSecs: s.totalSecs,
    focusCount: s.focusCount,
  };
}

/** Only the window that owns the timer may publish state… */
function fromOwner(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return event.sender === getOwnerWindow()?.webContents;
}

/** …and only the pop-out may push buttons on it. Neither check is load-bearing for
 *  safety today (both windows are ours), but they keep the direction of the relay a
 *  property of the code rather than a convention someone has to remember. */
function fromPopout(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return event.sender === getTimerWindow()?.webContents;
}

export function registerMiniTimerHandlers(showMain: () => void): void {
  // ── Window management (called by the main window's UI) ──────────────────────
  ipcMain.handle(IPC.MINI_TIMER.OPEN,   () => { openTimerWindow(); });
  ipcMain.handle(IPC.MINI_TIMER.CLOSE,  () => { closeTimerWindow(); });
  ipcMain.handle(IPC.MINI_TIMER.TOGGLE, () => toggleTimerWindow());
  ipcMain.handle(IPC.MINI_TIMER.IS_OPEN, () => isTimerWindowOpen());

  // Double-clicking the pill: come back to the app it belongs to.
  ipcMain.handle(IPC.MINI_TIMER.SHOW_MAIN, () => { showMain(); });

  // ── State relay ────────────────────────────────────────────────────────────
  // Fire-and-forget (`on`, not `handle`): the owner publishes on every meaningful
  // change and must never wait on a reply to keep counting.
  ipcMain.on(IPC.MINI_TIMER.PUBLISH, (event, raw: unknown) => {
    if (!fromOwner(event)) return;
    const state = parseState(raw);
    if (!state) {
      console.warn('[mini-timer] Ignoring a malformed timer snapshot.');
      return;
    }
    publishTimerState(state);
  });

  // A pop-out that just mounted asks for the current snapshot rather than waiting for
  // the next change — otherwise a paused timer would show nothing until it was started.
  ipcMain.handle(IPC.MINI_TIMER.GET_STATE, () => getCachedTimerState());

  ipcMain.on(IPC.MINI_TIMER.COMMAND, (event, command: unknown) => {
    if (!fromPopout(event)) return;
    if (!COMMANDS.includes(command as MiniTimerCommand)) {
      console.warn(`[mini-timer] Ignoring unknown command "${String(command)}".`);
      return;
    }
    // The owner runs it against the real store, then publishes the result back —
    // so the pill's buttons and the Study page's buttons do exactly the same thing.
    getOwnerWindow()?.webContents.send(IPC.MINI_TIMER.COMMAND, command);
  });
}
