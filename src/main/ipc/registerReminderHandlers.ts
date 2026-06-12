import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { ReminderConfig } from '../../shared/types';
import { configureReminders, sendTestNotification } from '../reminders';

export function registerReminderHandlers(): void {
  ipcMain.handle(IPC.REMINDERS.CONFIGURE, (_event, cfg: ReminderConfig) => {
    if (typeof cfg?.enabled !== 'boolean') throw new Error('enabled must be a boolean');
    if (!Number.isFinite(cfg.leadMinutes) || cfg.leadMinutes < 1 || cfg.leadMinutes > 120) {
      throw new Error('leadMinutes must be between 1 and 120');
    }
    if (typeof cfg.dueDigestEnabled !== 'boolean') throw new Error('dueDigestEnabled must be a boolean');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cfg.dueDigestTime)) {
      throw new Error('dueDigestTime must be "HH:MM" (24-hour)');
    }
    configureReminders({
      enabled: cfg.enabled,
      leadMinutes: cfg.leadMinutes,
      dueDigestEnabled: cfg.dueDigestEnabled,
      dueDigestTime: cfg.dueDigestTime,
    });
  });

  ipcMain.handle(IPC.REMINDERS.TEST, () => sendTestNotification());
}
