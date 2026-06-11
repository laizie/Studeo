import { Notification } from 'electron';
import { listClassMeetings } from './db/repositories/classMeetingRepo';
import { listCourses } from './db/repositories/courseRepo';
import type { ReminderConfig } from '../shared/types';

// Lecture-time reminders. The renderer pushes the user's preference here via
// IPC on startup and whenever it changes (main has no access to localStorage).
//
// Strategy: poll every 30s instead of scheduling far-future setTimeouts —
// long timers are unreliable across laptop sleep/wake, while a cheap SQLite
// read twice a minute is self-healing: waking mid-window still fires.

let config: ReminderConfig = { enabled: false, leadMinutes: 10 };
let interval: NodeJS.Timeout | null = null;

// One notification per meeting per day, even across config changes.
const fired = new Set<string>();

export function configureReminders(next: ReminderConfig): void {
  config = next;
  if (config.enabled) check();
}

function check(): void {
  if (!config.enabled || !Notification.isSupported()) return;

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  // Keep the fired set tiny: drop keys from previous days.
  for (const key of fired) {
    if (!key.endsWith(todayKey)) fired.delete(key);
  }

  const todaysMeetings = listClassMeetings().filter(m => m.day_of_week === now.getDay());
  if (todaysMeetings.length === 0) return;

  const courseById = new Map(listCourses().map(c => [c.id, c]));

  for (const m of todaysMeetings) {
    const [h, min] = m.start_time.split(':').map(Number);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
    const remindAt = new Date(start.getTime() - config.leadMinutes * 60_000);
    if (now < remindAt || now >= start) continue;

    const key = `${m.id}:${todayKey}`;
    if (fired.has(key)) continue;
    fired.add(key);

    const course = courseById.get(m.course_id);
    const minutesLeft = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60_000));
    new Notification({
      title: `${course?.abbreviation ?? 'Class'} starts in ${minutesLeft} min`,
      body: [course?.name, m.location ?? course?.building].filter(Boolean).join(' — '),
    }).show();
  }
}

export function startReminderScheduler(): void {
  if (interval) return;
  interval = setInterval(check, 30_000);
}
