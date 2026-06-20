import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron';
import { rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { IPC } from '../../shared/types';
import { getDb, getDbPath, closeDb, snapshotInto, validateBackupFile } from '../db/connection';
import { getAssetsRoot } from '../media';
import { getAllSettings, setSetting } from '../settings';

// Allowlist of preference keys the renderer may persist — IPC input is untrusted, so we
// never write an arbitrary key. Keep in sync with the settings store in the renderer.
const SETTING_KEYS = new Set([
  'theme',
  'defaultMusicService',
  'classRemindersEnabled',
  'reminderLeadMinutes',
  'dueDigestEnabled',
  'dueDigestTime',
  'timerSound',
  // Pomodoro timer configuration.
  'focusMins',
  'breakMins',
  'longBreakMins',
  'customTechnique',
]);

// App-level utilities for a local-first app: let the user see exactly where
// their data lives, and take a backup copy of it on demand.

export function registerAppHandlers(): void {
  ipcMain.handle(IPC.APP.REVEAL_DATA, () => {
    shell.showItemInFolder(getDbPath());
  });

  // Preferences persistence. GET is synchronous (ipcMain.on + event.returnValue) so the
  // preload can read it before the renderer paints — e.g. the theme applies with no flash.
  ipcMain.on(IPC.APP.GET_SETTINGS, (event) => {
    event.returnValue = getAllSettings();
  });

  ipcMain.handle(IPC.APP.SET_SETTING, (_event, key: string, value: string) => {
    // Ignore unknown keys / non-string values rather than throwing — a bad call just
    // doesn't persist anything.
    if (SETTING_KEYS.has(key) && typeof value === 'string') setSetting(key, value);
  });

  ipcMain.handle(IPC.APP.BACKUP_DATA, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const today = new Date().toISOString().slice(0, 10);
    const options = {
      title: 'Back up Studeo data',
      defaultPath: `Studeo-backup-${today}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return { saved: false };

    try {
      // VACUUM INTO writes a consistent single-file snapshot even in WAL mode
      // (a plain file copy could catch the db mid-write). It refuses to
      // overwrite, so clear the target the save dialog already confirmed.
      rmSync(filePath, { force: true });
      getDb().prepare('VACUUM INTO ?').run(filePath);

      // Note images live outside the .db file, so a db-only backup would lose them on
      // restore. Copy the asset folder next to the backup (e.g. "…-backup-2026-06-13-assets/")
      // whenever there are any. Sibling folder rather than a zip — no archive dependency.
      const assetsRoot = getAssetsRoot();
      if (existsSync(assetsRoot) && readdirSync(assetsRoot).length > 0) {
        const assetsTarget = filePath.replace(/\.db$/i, '') + '-assets';
        rmSync(assetsTarget, { recursive: true, force: true });
        cpSync(assetsRoot, assetsTarget, { recursive: true });
      }

      return { saved: true, path: filePath };
    } catch (err) {
      return { saved: false, error: err instanceof Error ? err.message : 'Backup failed' };
    }
  });

  // Restore is the inverse of backup, and the one action that overwrites all
  // current data — so it validates the chosen file, snapshots the current data
  // first (recoverable), swaps the file, then relaunches for a clean re-init.
  ipcMain.handle(IPC.APP.RESTORE_DATA, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Restore Studeo data from a backup',
      properties: ['openFile' as const],
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return { restored: false, canceled: true };

    const backupPath = filePaths[0];

    // 1. Make sure this is actually a Studeo database before touching anything.
    try {
      validateBackupFile(backupPath);
    } catch (err) {
      return { restored: false, error: err instanceof Error ? err.message : 'Invalid backup file' };
    }

    const dbPath = getDbPath();
    const assetsRoot = getAssetsRoot();

    try {
      // 2. Safety net: snapshot the CURRENT data before we overwrite it, so a
      //    mistaken restore is itself recoverable. Best-effort on the assets.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const snapshotPath = path.join(path.dirname(dbPath), `studeo-pre-restore-${stamp}.db`);
      rmSync(snapshotPath, { force: true });
      snapshotInto(snapshotPath);
      if (existsSync(assetsRoot) && readdirSync(assetsRoot).length > 0) {
        cpSync(assetsRoot, snapshotPath.replace(/\.db$/i, '') + '-assets', { recursive: true });
      }

      // 3. Swap in the backup. Close the connection first so the file handle is
      //    released, and drop the stale WAL sidecars so they can't be replayed
      //    on top of the restored file.
      closeDb();
      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
      cpSync(backupPath, dbPath);

      // Restore note images if the backup carried its sibling "…-assets" folder.
      const backupAssets = backupPath.replace(/\.db$/i, '') + '-assets';
      if (existsSync(backupAssets)) {
        rmSync(assetsRoot, { recursive: true, force: true });
        cpSync(backupAssets, assetsRoot, { recursive: true });
      }
    } catch (err) {
      return { restored: false, error: err instanceof Error ? err.message : 'Restore failed' };
    }

    // 4. Relaunch so everything re-initializes from the restored file (migrations
    //    re-run, renderer caches rebuild). Delay briefly so this reply reaches the
    //    renderer before the window is torn down.
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 400);
    return { restored: true };
  });
}
