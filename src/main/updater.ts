import { app, autoUpdater } from 'electron';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import type { UpdateCheckResult } from '../shared/types';

/**
 * Wires up automatic updates.
 *
 * How it works: `update-electron-app` points Electron's built-in `autoUpdater`
 * at the free `https://update.electronjs.org` service. On a set interval the
 * installed app asks that service "is there a release newer than the version I'm
 * running?" The service reads the *latest published (non-draft) release* of the
 * GitHub repo below and, if there's a newer one, hands back the platform's
 * update file:
 *   - macOS   -> the signed `.zip` of Studeo.app   (Squirrel.Mac)
 *   - Windows -> the `RELEASES` + `.nupkg` files    (Squirrel.Windows)
 * The new build downloads in the background; `notifyUser` then shows a dialog
 * offering to restart and apply it.
 *
 * Requirements (already satisfied by this project):
 *   - The GitHub repo is PUBLIC.
 *   - macOS builds are code-signed + notarized (Squirrel.Mac refuses unsigned).
 *   - A release is *published* (not draft) before its version is offered.
 */
export function initAutoUpdater(): void {
  // In development the app isn't packaged or signed, so the OS updaters can't
  // run. Skipping here avoids noisy errors while running `npm start`.
  if (!app.isPackaged) {
    return;
  }

  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      // Must match the repo the release workflow publishes to — this pointed at the
      // old "classtrack" working title long after the rename, so every installed copy
      // asked an endpoint that has no releases and silently never updated.
      repo: 'laizie/Studeo',
    },
    // Check on launch and then hourly. The service is cheap to hit and this
    // keeps a long-running app reasonably fresh without being chatty.
    updateInterval: '1 hour',
    // Show the built-in "A new version has been downloaded. Restart now?" dialog
    // once an update is ready, instead of silently applying it on next quit.
    notifyUser: true,
  });

  // Remember that a build is already staged. The hourly check may have found and
  // downloaded one long before the user opens Settings, and at that point asking
  // GitHub again answers "no newer release" — technically true, and exactly the
  // wrong thing to tell someone who has an update sitting on disk.
  autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
    downloadedVersion = releaseName ?? '';
  });
}

/** Set once an update has finished downloading; null while none is staged. */
let downloadedVersion: string | null = null;

/** In-flight manual check, so a double-click asks the service once. */
let pendingCheck: Promise<UpdateCheckResult> | null = null;

// The service is usually quick; this only exists so a lost connection ends in a
// message rather than a button that spins forever.
const CHECK_TIMEOUT_MS = 45_000;

/**
 * Ask the update service right now, on the user's command, instead of waiting for
 * the hourly check.
 *
 * Electron's `autoUpdater` is event-based, not promise-based: `checkForUpdates()`
 * returns nothing and the answer arrives later as `update-available`,
 * `update-not-available`, or `error`. So this wraps that one round trip into a
 * promise the renderer can await, and detaches its listeners either way.
 */
export function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  // Unpackaged builds have no feed URL and aren't signed, so the OS updaters
  // can't run at all — say so plainly rather than reporting a confusing error.
  if (!app.isPackaged) {
    return Promise.resolve({ status: 'unsupported' });
  }
  if (downloadedVersion !== null) {
    return Promise.resolve({ status: 'downloaded', version: downloadedVersion || undefined });
  }
  if (pendingCheck) {
    return pendingCheck;
  }

  const check = new Promise<UpdateCheckResult>((resolve) => {
    const onAvailable    = () => settle({ status: 'downloading' });
    const onNotAvailable = () => settle({ status: 'up-to-date' });
    const onError = (err: Error) =>
      settle({ status: 'error', message: err?.message || 'The update check failed.' });

    const timer = setTimeout(
      () => settle({ status: 'error', message: "The update service didn't answer." }),
      CHECK_TIMEOUT_MS,
    );

    function settle(result: UpdateCheckResult) {
      clearTimeout(timer);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
      resolve(result);
    }

    autoUpdater.on('update-available', onAvailable);
    autoUpdater.on('update-not-available', onNotAvailable);
    autoUpdater.on('error', onError);

    try {
      autoUpdater.checkForUpdates();
    } catch (err) {
      // Throws synchronously if no feed URL was ever set (e.g. initAutoUpdater
      // bailed out), which would otherwise hang until the timeout.
      settle({ status: 'error', message: err instanceof Error ? err.message : 'The update check failed.' });
    }
  });

  pendingCheck = check;
  check.then(() => { pendingCheck = null; });
  return check;
}
