import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { IPC } from '../../shared/types';
import { getDb, getDbPath } from '../db/connection';
import { getAssetsRoot } from '../media';

// App-level utilities for a local-first app: let the user see exactly where
// their data lives, and take a backup copy of it on demand.

export function registerAppHandlers(): void {
  ipcMain.handle(IPC.APP.REVEAL_DATA, () => {
    shell.showItemInFolder(getDbPath());
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
}
