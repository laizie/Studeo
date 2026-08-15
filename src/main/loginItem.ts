import { app } from 'electron';
import path from 'node:path';

/**
 * "Start Studeo when I log in."
 *
 * Why this matters more than it sounds: class reminders, the due digest, and the
 * menu-bar "Up next" item all run in the main process on a 30-second poll. They
 * exist only while the app is running. Without this, a restart on Sunday night
 * silently switches off every reminder until you happen to open the app again —
 * and a reminder that doesn't fire looks exactly like a reminder you never set.
 *
 * The OS is the source of truth, not our settings file. The user can turn this
 * off in System Settings → General → Login Items (or Task Manager → Startup) and
 * we'd never hear about it; if we cached our own copy, Settings would keep
 * claiming "on" while nothing launched. So every read asks the OS.
 */

export interface LoginItemState {
  /** False when we can't honour the setting at all — see `supportsLoginItem`. */
  supported: boolean;
  openAtLogin: boolean;
}

/**
 * Electron implements login items on macOS and Windows only, and only a packaged
 * app has a stable path to register: under `npm start` the executable is the
 * shared Electron dev binary, so enabling it would add *that* to the user's
 * startup items and point it at nothing useful.
 */
function supportsLoginItem(): boolean {
  return app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32');
}

/**
 * On Windows, Squirrel installs the app into a versioned `app-1.3.4` folder, so
 * registering `process.execPath` would break the moment an update lands and the
 * folder is renamed. The stable entry point is the `Update.exe` stub that sits
 * one level above it, asked to start the current version by name. This is the
 * pattern Electron's own docs prescribe for Squirrel.Windows.
 *
 * `--hidden` is passed through to the launched app so a login start can come up
 * in the tray instead of throwing a window at you — see `launchedInBackground`.
 */
function windowsLoginItemOptions() {
  const appFolder = path.dirname(process.execPath);
  const updateExe = path.resolve(appFolder, '..', 'Update.exe');
  const exeName = path.basename(process.execPath);
  return {
    path: updateExe,
    args: ['--processStart', `"${exeName}"`, '--process-start-args', '"--hidden"'],
  };
}

/** What the OS currently believes, plus whether we can change it. */
export function getLoginItemState(): LoginItemState {
  if (!supportsLoginItem()) return { supported: false, openAtLogin: false };
  return { supported: true, openAtLogin: app.getLoginItemSettings().openAtLogin };
}

/** Turn the login item on or off, and report back the state the OS ended up in. */
export function setOpenAtLogin(enabled: boolean): LoginItemState {
  if (!supportsLoginItem()) return { supported: false, openAtLogin: false };

  app.setLoginItemSettings({
    openAtLogin: enabled,
    ...(process.platform === 'win32' ? windowsLoginItemOptions() : {}),
  });

  // Read back rather than echoing the request: if the OS refused, the toggle
  // should show what's true, not what we asked for.
  return getLoginItemState();
}

/**
 * Whether this launch should come up quietly, with no window.
 *
 * Windows only, and deliberately so. macOS 13 moved login items to SMAppService,
 * where Electron no longer reports `wasOpenedAtLogin` and `openAsHidden` has no
 * effect — there is no supported way to tell "the system started me" apart from
 * "the user started me". Rather than guess, macOS opens the window as usual;
 * closing it leaves Studeo running in the menu bar, which is where the reminders
 * live anyway.
 */
export function launchedInBackground(): boolean {
  return process.platform === 'win32' && process.argv.includes('--hidden');
}
