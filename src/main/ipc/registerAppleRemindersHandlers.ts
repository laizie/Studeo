import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import {
  getAppleRemindersStatus,
  setAppleRemindersEnabled,
  setAppleRemindersRemoveCompleted,
  syncAppleReminders,
  rebuildAppleRemindersMirror,
} from '../applereminders';

// The Apple Reminders mirror. Every handler returns the whole status object so the
// renderer never has to guess what changed — one shape, one source of truth.

export function registerAppleRemindersHandlers(): void {
  ipcMain.handle(IPC.APPLE_REMINDERS.STATUS, () => getAppleRemindersStatus());

  ipcMain.handle(IPC.APPLE_REMINDERS.SET_ENABLED, (_event, enabled: unknown) => {
    // IPC input is untrusted: coerce to a real boolean before it reaches settings.
    return setAppleRemindersEnabled(enabled === true);
  });

  ipcMain.handle(IPC.APPLE_REMINDERS.SET_REMOVE_COMPLETED, (_event, remove: unknown) => {
    return setAppleRemindersRemoveCompleted(remove === true);
  });

  ipcMain.handle(IPC.APPLE_REMINDERS.SYNC_NOW, () => syncAppleReminders());

  ipcMain.handle(IPC.APPLE_REMINDERS.REBUILD, () => rebuildAppleRemindersMirror());
}
