// Pure date logic — no Electron/Node imports so this is usable everywhere and unit-testable.

export type DeadlineUrgency = 'overdue' | 'today' | 'soon' | 'upcoming';

export interface DeadlineInfo {
  label: string;
  urgency: DeadlineUrgency;
}

// Parse a YYYY-MM-DD string as a local-timezone midnight date.
// Using `new Date("2026-06-10")` without this parses as UTC midnight, which causes
// off-by-one errors in negative-offset timezones (e.g., EST shows June 9 at 7 PM).
function parseDateLocal(dateStr: string): Date {
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

  if (diffDays < 0)   return { label: 'Overdue',           urgency: 'overdue'  };
  if (diffDays === 0) return { label: 'Today',             urgency: 'today'    };
  if (diffDays === 1) return { label: 'Tomorrow',          urgency: 'today'    };
  if (diffDays <= 7)  return { label: `${diffDays} days`,  urgency: 'soon'     };

  const weeks = Math.floor(diffDays / 7);
  return { label: weeks === 1 ? '1 week' : `${weeks} weeks`, urgency: 'upcoming' };
}

// Format a YYYY-MM-DD string for display ("Jun 10").
export function formatDueDate(dueDate: string): string {
  return parseDateLocal(dueDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
