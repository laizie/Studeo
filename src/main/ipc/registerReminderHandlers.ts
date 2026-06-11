import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { ReminderConfig } from '../../shared/types';
import { configureReminders } from '../reminders';

export function registerReminderHandlers(): void {
  ipcMain.handle(IPC.REMINDERS.CONFIGURE, (_event, cfg: ReminderConfig) => {
    if (typeof cfg?.enabled !== 'boolean') throw new Error('enabled must be a boolean');
    if (!Number.isFinite(cfg.leadMinutes) || cfg.leadMinutes < 1 || cfg.leadMinutes > 120) {
      throw new Error('leadMinutes must be between 1 and 120');
    }
    configureReminders({ enabled: cfg.enabled, leadMinutes: cfg.leadMinutes });
  });
}
