// Pure date logic — no Electron/Node imports so this is usable everywhere and unit-testable.

export type DeadlineUrgency =
  | 'overdue'   // past due
  | 'today'     // due today          → red
  | 'tomorrow'  // due tomorrow       → orange
  | 'soon'      // 2–3 days           → yellow
  | 'week'      // 4–7 days           → light green
  | 'later'     // 1–2 weeks          → green
  | 'future';   // 3+ weeks           → dark green

export interface DeadlineInfo {
  label: string;
  urgency: DeadlineUrgency;
}

// Parse a YYYY-MM-DD string as a local-timezone midnight date.
// Using `new Date("2026-06-10")` without this parses as UTC midnight, which causes
// off-by-one errors in negative-offset timezones (e.g., EST shows June 9 at 7 PM).
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function computeDeadlineLabel(
  dueDate: string,
  now: Date = new Date()
): DeadlineInfo {
  const due = parseDateLocal(dueDate);
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((due.getTime() - nowMidnight.getTime()) / 86_400_000);

  if (diffDays < 0)   return { label: 'Overdue',          urgency: 'overdue'  };
  if (diffDays === 0) return { label: 'Today',            urgency: 'today'    };
  if (diffDays === 1) return { label: 'Tomorrow',         urgency: 'tomorrow' };
  if (diffDays <= 3)  return { label: `${diffDays} days`, urgency: 'soon'     };
  if (diffDays <= 7)  return { label: `${diffDays} days`, urgency: 'week'     };

  const weeks = Math.floor(diffDays / 7);
  const label = weeks === 1 ? '1 week' : `${weeks} weeks`;
  if (weeks <= 2)     return { label, urgency: 'later'  };
  return                     { label, urgency: 'future' };
}

// Format a YYYY-MM-DD string for display ("Jun 10").
export function formatDueDate(dueDate: string): string {
  return parseDateLocal(dueDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Format an "HH:MM" (24h) clock time for display ("9:05 AM"). Shared by the
// assignment due-time display and the menu-bar/tray formatting.
export function formatClock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

// A sortable key that orders items by due date, then within a day puts all-day
// items (no time) before timed ones, which then run in chronological order.
// Mirrors the SQL `ORDER BY due_date, (due_time IS NULL) DESC, due_time` so the
// renderer's re-sorts agree with the repository's list order.
export function dueSortValue(dueDate: string, dueTime: string | null | undefined): string {
  return `${dueDate}T${dueTime ?? ''}`;
}
