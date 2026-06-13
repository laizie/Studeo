import { app } from 'electron';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

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
      repo: 'laizie/classtrack',
    },
    // Check on launch and then hourly. The service is cheap to hit and this
    // keeps a long-running app reasonably fresh without being chatty.
    updateInterval: '1 hour',
    // Show the built-in "A new version has been downloaded. Restart now?" dialog
    // once an update is ready, instead of silently applying it on next quit.
    notifyUser: true,
  });
}
