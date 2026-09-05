import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { hardenWindow } from './security';
import { getSetting, setSetting } from './settings';
import { rendererUrl, MINI_TIMER_HASH } from './rendererUrl';
import { IPC } from '../shared/types';
import type { MiniTimerState } from '../shared/pomodoro';

/**
 * The floating Pomodoro pop-out.
 *
 * ── What this window is ──────────────────────────────────────────────────────
 * A small, frameless, always-on-top pill that shows the running timer and takes
 * play/pause/skip. It does NOT run a timer. The main window owns the Zustand store,
 * and a second BrowserWindow is a second JavaScript context — giving it the store
 * would mean two independent countdowns, two chimes, and (because the store logs a
 * study session during startup recovery) duplicate rows in the database.
 *
 * So main is a relay with a one-slot mailbox:
 *   owner window --PUBLISH--> [lastState] --STATE--> pop-out
 *   pop-out ------COMMAND---> owner window
 *
 * Snapshots carry `endsAt` (a wall-clock instant), so the pop-out derives its own
 * countdown locally and we only send a message when something real changes — one IPC
 * per phase transition rather than one per second.
 *
 * ── Staying in front, on the right screen ────────────────────────────────────
 * "Always on top" is three separate settings on macOS, and missing any one of them
 * makes the window disappear at exactly the moment you wanted it:
 *   1. alwaysOnTop at the 'screen-saver' level — above ordinary windows AND above
 *      other apps' floating panels. The default 'floating' level loses to some of them.
 *   2. visibleOnAllWorkspaces + visibleOnFullScreenWindows — otherwise the pill lives
 *      on the Space it was born on, and vanishes the moment you switch Spaces or put
 *      an app in fullscreen (which is when a focus timer matters most).
 *   3. type: 'panel' — an NSPanel is the window kind macOS actually allows to draw
 *      over another app's fullscreen Space. It's also non-activating, so clicking
 *      pause doesn't pull you out of the app you were working in.
 * `skipTransformProcessType` keeps the Dock icon from flickering when (2) is applied.
 */

// A pill, not a window: wide enough for MM:SS plus three controls, no taller than
// a menu-bar item. Fixed size, so the numbers can be laid out with confidence.
const WIDTH  = 224;
const HEIGHT = 84;

// How far off the corner of the screen it sits, and how close to an edge we ever
// allow it to be re-clamped (below).
const MARGIN = 24;
const EDGE   = 8;

/** Remembered position, as JSON `{x, y}` in the main-process settings file. */
const POSITION_KEY = 'miniTimerPosition';

let win: BrowserWindow | null = null;

/** The most recent snapshot the owner window published; replayed to a pop-out that
 *  opens later, so its first paint is correct rather than blank-then-correct. */
let lastState: MiniTimerState | null = null;

/** How to reach the window that owns the timer. Injected by main.ts so this module
 *  doesn't have to know how the main window is created or recreated. */
let ownerWindow: () => BrowserWindow | null = () => null;

export function initTimerWindow(getOwner: () => BrowserWindow | null): void {
  ownerWindow = getOwner;
}

// ── Placement ─────────────────────────────────────────────────────────────────

/**
 * Keep a position on a screen that currently exists.
 *
 * `getDisplayMatching` returns the display the rectangle overlaps most, and — this is
 * the part that matters for a laptop that gets undocked — the NEAREST display when it
 * overlaps none at all. Clamping into that display's `workArea` (which already excludes
 * the menu bar and Dock) is what stops the pill from being stranded on the coordinates
 * of a monitor that isn't plugged in any more.
 */
function clampToDisplay(x: number, y: number): { x: number; y: number } {
  const { workArea } = screen.getDisplayMatching({ x, y, width: WIDTH, height: HEIGHT });
  const maxX = workArea.x + workArea.width  - WIDTH  - EDGE;
  const maxY = workArea.y + workArea.height - HEIGHT - EDGE;
  return {
    x: Math.round(Math.min(Math.max(x, workArea.x + EDGE), Math.max(maxX, workArea.x + EDGE))),
    y: Math.round(Math.min(Math.max(y, workArea.y + EDGE), Math.max(maxY, workArea.y + EDGE))),
  };
}

/** Top-right of whichever display the main window is on — not the primary display.
 *  On a two-monitor desk the pill should appear next to the work, not on the laptop
 *  screen the app happens not to be using. */
function defaultPosition(): { x: number; y: number } {
  const owner = ownerWindow();
  const display = owner
    ? screen.getDisplayMatching(owner.getBounds())
    : screen.getPrimaryDisplay();
  const { workArea } = display;
  return {
    x: workArea.x + workArea.width - WIDTH - MARGIN,
    y: workArea.y + MARGIN,
  };
}

function readSavedPosition(): { x: number; y: number } | null {
  const raw = getSetting(POSITION_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y };
  } catch {
    return null;
  }
}

// Dragging fires `moved` continuously; only the resting place is worth a disk write.
let saveTimer: NodeJS.Timeout | null = null;

function writePosition(): void {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  setSetting(POSITION_KEY, JSON.stringify({ x, y }));
}

function savePositionSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writePosition();
  }, 500);
}

/** Write the position now instead of losing it to a pending debounce. Wired to the
 *  window's own `close`, so it covers every way the pill goes away — its ×, the main
 *  window closing, and quitting the app half a second after nudging it. */
function flushPosition(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  writePosition();
}

/**
 * Re-apply the three float settings.
 *
 * Called again after display changes because macOS can quietly drop a window's level
 * when the screen arrangement changes underneath it — the window is still there, it
 * has just stopped being on top, which is the one thing it exists to do.
 */
function assertFloating(w: BrowserWindow): void {
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    // Without this, every call briefly hides the app's Dock icon and window while macOS
    // transforms the process type — a visible flicker, and this runs again on every
    // display change. `type: 'panel'` above is what actually gets us over fullscreen.
    skipTransformProcessType: true,
  });
}

/** A monitor was added, removed, or rearranged: make sure the pill is still on a
 *  real screen, and still floating. */
function onDisplayChange(): void {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const clamped = clampToDisplay(x, y);
  if (clamped.x !== x || clamped.y !== y) win.setPosition(clamped.x, clamped.y);
  assertFloating(win);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * While the pop-out is up, stop Chromium throttling the owner window's timers.
 *
 * The whole point of the pop-out is that you minimize or cover Studeo and keep working.
 * A hidden renderer has its intervals throttled — to roughly once a minute after a few
 * minutes offscreen — and the countdown is driven by an interval in that renderer. The
 * elapsed time would still come out right (it's derived from a timestamp), but the phase
 * would flip up to a minute late: the pill would sit at 00:00, and the chime and the
 * "Focus session complete" notification would arrive when you'd already stopped waiting.
 */
function setOwnerThrottling(enabled: boolean): void {
  const owner = ownerWindow();
  if (owner && !owner.isDestroyed()) {
    owner.webContents.setBackgroundThrottling(enabled);
  }
}

/** Tell the main window whether the pop-out is up, so its button reads "Pop out" /
 *  "Close pop-out" correctly even when the pill was closed from its own ×. */
function notifyOwnerOpenChanged(isOpen: boolean): void {
  const owner = ownerWindow();
  if (owner && !owner.isDestroyed()) {
    owner.webContents.send(IPC.MINI_TIMER.OPEN_CHANGED, isOpen);
  }
}

/** The window that owns the timer store, if there is one. */
export function getOwnerWindow(): BrowserWindow | null {
  const owner = ownerWindow();
  return owner && !owner.isDestroyed() ? owner : null;
}

/** The pop-out itself, if it's up. */
export function getTimerWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

export function isTimerWindowOpen(): boolean {
  return win !== null && !win.isDestroyed();
}

export function openTimerWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    assertFloating(win);
    return;
  }

  const saved = readSavedPosition();
  const { x, y } = saved ? clampToDisplay(saved.x, saved.y) : defaultPosition();
  const isMac = process.platform === 'darwin';

  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x,
    y,
    // The pill draws its own rounded card, so the OS frame and background go away.
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // See the header comment: on macOS an NSPanel is what may float over another app's
    // fullscreen Space, and it doesn't steal activation when you click it.
    ...(isMac ? { type: 'panel' as const } : {}),
    alwaysOnTop: true,
    // Deliver the FIRST click to the page instead of spending it on activating the
    // window. Without this the pill is unusable in exactly the situation it's built
    // for: it appears without focus (showInactive), and as a non-activating panel it
    // mostly stays that way — so macOS would swallow the click you meant for Play and
    // you'd have to press it twice, every time.
    acceptFirstMouse: true,
    // Nothing is painted until the document is ready — a transparent window that shows
    // early flashes an empty rectangle in the corner of the screen.
    show: false,
    title: 'Studeo Timer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = rendererUrl(MINI_TIMER_HASH);
  hardenWindow(win, url);
  win.loadURL(url);

  assertFloating(win);

  win.once('ready-to-show', () => {
    // showInactive, not show: the pill appearing must not pull focus away from whatever
    // you were typing in. It stays clickable either way.
    win?.showInactive();
  });

  win.on('moved', savePositionSoon);
  win.on('close', flushPosition);
  win.on('show', () => { if (win) assertFloating(win); });

  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);

  win.on('closed', () => {
    screen.removeListener('display-added', onDisplayChange);
    screen.removeListener('display-removed', onDisplayChange);
    screen.removeListener('display-metrics-changed', onDisplayChange);
    win = null;
    setOwnerThrottling(true);
    notifyOwnerOpenChanged(false);
  });

  setOwnerThrottling(false);
  notifyOwnerOpenChanged(true);
}

export function closeTimerWindow(): void {
  if (!win || win.isDestroyed()) return;
  win.close(); // the 'close' and 'closed' handlers above do the rest
}

/** Open if closed, close if open. Returns the state it ended up in. */
export function toggleTimerWindow(): boolean {
  if (isTimerWindowOpen()) {
    closeTimerWindow();
    return false;
  }
  openTimerWindow();
  return true;
}

// ── State relay ───────────────────────────────────────────────────────────────

export function publishTimerState(state: MiniTimerState): void {
  lastState = state;
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.MINI_TIMER.STATE, state);
  }
}

export function getCachedTimerState(): MiniTimerState | null {
  return lastState;
}
