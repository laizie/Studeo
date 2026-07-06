import { Notification } from 'electron';
import { listClassMeetings } from './db/repositories/classMeetingRepo';
import { listCourses } from './db/repositories/courseRepo';
import { listAssignments } from './db/repositories/assignmentRepo';
import { listTasks } from './db/repositories/taskRepo';
import { listMeetingExceptions } from './db/repositories/meetingExceptionRepo';
import { buildExceptionIndex, resolveOccurrence } from '../shared/meetingExceptions';
import type { ReminderConfig, ReminderNavTarget } from '../shared/types';

// Desktop reminders. The renderer pushes the user's preference here via
// IPC on startup and whenever it changes (main has no access to localStorage).
//
// Strategy: poll every 30s instead of scheduling far-future setTimeouts —
// long timers are unreliable across laptop sleep/wake, while a cheap SQLite
// read twice a minute is self-healing: waking mid-window still fires.
//
// Two kinds of reminder share the scheduler:
//   1. Class reminders — "X starts in N min" before each meeting today.
//   2. Due digest — once a day at a chosen time, one notification listing
//      everything (assignments + tasks) due today and tomorrow.

let config: ReminderConfig = {
  enabled: false,
  leadMinutes: 10,
  dueDigestEnabled: false,
  dueDigestTime: '18:00',
};
let interval: NodeJS.Timeout | null = null;

// One notification per meeting (or digest) per day, even across config changes.
const fired = new Set<string>();

// Where clicks go. main.ts wires this to a function that focuses the window and
// pushes the target to the renderer. Kept as an injected callback (rather than
// importing BrowserWindow here) so this module stays about *scheduling* and has
// no dependency on window lifecycle.
let navHandler: ((target: ReminderNavTarget) => void) | null = null;

export function setReminderNavigationHandler(fn: (target: ReminderNavTarget) => void): void {
  navHandler = fn;
}

export function configureReminders(next: ReminderConfig): void {
  config = next;
  if (config.enabled || config.dueDigestEnabled) check();
}

/** Local calendar date as YYYY-MM-DD. Due dates are stored as local dates, and
 *  toISOString() would roll the key over at UTC midnight (~8 PM Eastern). */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function check(): void {
  if (!Notification.isSupported()) return;

  const now = new Date();
  const todayKey = localDateKey(now);

  // Keep the fired set tiny: drop keys from previous days.
  for (const key of fired) {
    if (!key.endsWith(todayKey)) fired.delete(key);
  }

  if (config.enabled) checkClassReminders(now, todayKey);
  if (config.dueDigestEnabled) checkDueDigest(now, todayKey);
}

function checkClassReminders(now: Date, todayKey: string): void {
  const todaysMeetings = listClassMeetings().filter(m => m.day_of_week === now.getDay());
  if (todaysMeetings.length === 0) return;

  const courseById = new Map(listCourses().map(c => [c.id, c]));
  const exceptionIndex = buildExceptionIndex(listMeetingExceptions());

  for (const m of todaysMeetings) {
    // Don't remind about a cancelled class; remind at the moved time instead
    // of the regular one when today's occurrence was rescheduled.
    const occ = resolveOccurrence(m, todayKey, exceptionIndex);
    if (occ.cancelled) continue;

    const [h, min] = occ.startTime.split(':').map(Number);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
    const remindAt = new Date(start.getTime() - config.leadMinutes * 60_000);
    if (now < remindAt || now >= start) continue;

    const key = `${m.id}:${todayKey}`;
    if (fired.has(key)) continue;
    fired.add(key);

    const course = courseById.get(m.course_id);
    const minutesLeft = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60_000));
    const notif = new Notification({
      title: `${course?.abbreviation ?? 'Class'} starts in ${minutesLeft} min`,
      body: [course?.name, occ.location ?? course?.building].filter(Boolean).join(' — '),
    });
    // Clicking the reminder opens that course's page.
    if (course) notif.on('click', () => navHandler?.({ view: 'course', courseId: course.id }));
    notif.show();
  }
}

function checkDueDigest(now: Date, todayKey: string): void {
  const [h, min] = config.dueDigestTime.split(':').map(Number);
  const digestAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
  if (now < digestAt) return;

  const key = `due-digest:${todayKey}`;
  if (fired.has(key)) return;
  // Mark fired even when there's nothing due, so we don't re-query every 30s.
  fired.add(key);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);

  const courseById = new Map(listCourses().map(c => [c.id, c]));
  const label = (name: string, courseId: string | null) => {
    const abbr = courseId ? courseById.get(courseId)?.abbreviation : null;
    return abbr ? `${abbr} — ${name}` : name;
  };

  const open = [
    ...listAssignments().filter(a => a.status !== 'completed')
      .map(a => ({ due: a.due_date, text: label(a.name, a.course_id) })),
    ...listTasks().filter(t => t.status !== 'completed')
      .map(t => ({ due: t.due_date, text: label(t.name, null) })),
  ];

  const dueToday    = open.filter(i => i.due === todayKey);
  const dueTomorrow = open.filter(i => i.due === tomorrowKey);
  const total = dueToday.length + dueTomorrow.length;
  if (total === 0) return;

  const lines: string[] = [];
  if (dueToday.length > 0)    lines.push(`Today: ${dueToday.map(i => i.text).join(', ')}`);
  if (dueTomorrow.length > 0) lines.push(`Tomorrow: ${dueTomorrow.map(i => i.text).join(', ')}`);

  const notif = new Notification({
    title: total === 1 ? '1 item due soon' : `${total} items due soon`,
    body: lines.join('\n'),
  });
  // Clicking the digest opens the This Week list.
  notif.on('click', () => navHandler?.({ view: 'this-week' }));
  notif.show();
}

/** Fire a sample notification on demand so the user can verify that the OS
 *  is actually showing Studeo's notifications before relying on them. */
export function sendTestNotification(): { supported: boolean } {
  if (!Notification.isSupported()) return { supported: false };
  new Notification({
    title: 'Reminders are working',
    body: 'This is how class and due-date reminders will look.',
  }).show();
  return { supported: true };
}

export function startReminderScheduler(): void {
  if (interval) return;
  interval = setInterval(check, 30_000);
}
