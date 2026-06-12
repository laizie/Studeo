import { describe, it, expect } from 'vitest';
import { parseDateLocal, computeDeadlineLabel, formatDueDate } from '../deadlines';

function offsetDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Format using LOCAL date components, matching how the app stores and parses
// due dates (parseDateLocal). toISOString() gives the UTC date, which is
// already "tomorrow" during evening hours west of UTC — that mismatch made
// these tests fail every night after 8 PM Eastern.
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── parseDateLocal ─────────────────────────────────────────────────────────────

describe('parseDateLocal', () => {
  it('parses year, month, and day correctly', () => {
    const d = parseDateLocal('2026-06-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June = index 5
    expect(d.getDate()).toBe(15);
  });

  it('treats the date as local midnight (hours = 0)', () => {
    const d = parseDateLocal('2026-01-01');
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('ignores any time portion after the date', () => {
    const d = parseDateLocal('2026-06-15T23:59:59Z');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getDate()).toBe(15);
  });
});

// ── computeDeadlineLabel ───────────────────────────────────────────────────────

describe('computeDeadlineLabel', () => {
  it('returns overdue for yesterday', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(-1)));
    expect(result).toEqual({ label: 'Overdue', urgency: 'overdue' });
  });

  it('returns overdue for dates well in the past', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(-30)));
    expect(result.urgency).toBe('overdue');
  });

  it('returns today for the current date', () => {
    const result = computeDeadlineLabel(toDateStr(new Date()));
    expect(result).toEqual({ label: 'Today', urgency: 'today' });
  });

  it('returns tomorrow for 1 day ahead', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(1)));
    expect(result).toEqual({ label: 'Tomorrow', urgency: 'tomorrow' });
  });

  it('returns soon for 2 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(2)));
    expect(result).toEqual({ label: '2 days', urgency: 'soon' });
  });

  it('returns soon for 3 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(3)));
    expect(result).toEqual({ label: '3 days', urgency: 'soon' });
  });

  it('returns week for 4 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(4)));
    expect(result).toEqual({ label: '4 days', urgency: 'week' });
  });

  it('returns week for exactly 7 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(7)));
    expect(result).toEqual({ label: '7 days', urgency: 'week' });
  });

  it('returns later with singular "1 week" label for 8 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(8)));
    expect(result).toEqual({ label: '1 week', urgency: 'later' });
  });

  it('returns later with "2 weeks" label for 14 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(14)));
    expect(result).toEqual({ label: '2 weeks', urgency: 'later' });
  });

  it('returns future with "3 weeks" for 21 days', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(21)));
    expect(result).toEqual({ label: '3 weeks', urgency: 'future' });
  });

  it('returns future for far-future dates', () => {
    const result = computeDeadlineLabel(toDateStr(offsetDate(90)));
    expect(result.urgency).toBe('future');
  });

  it('accepts an explicit now parameter', () => {
    const now = new Date(2026, 0, 10); // Jan 10
    expect(computeDeadlineLabel('2026-01-10', now)).toEqual({ label: 'Today', urgency: 'today' });
    expect(computeDeadlineLabel('2026-01-09', now)).toEqual({ label: 'Overdue', urgency: 'overdue' });
    expect(computeDeadlineLabel('2026-01-11', now)).toEqual({ label: 'Tomorrow', urgency: 'tomorrow' });
  });
});

// ── formatDueDate ──────────────────────────────────────────────────────────────

describe('formatDueDate', () => {
  it('formats a date as "Mon D" style', () => {
    expect(formatDueDate('2026-06-15')).toBe('Jun 15');
  });

  it('formats January 1 correctly', () => {
    expect(formatDueDate('2026-01-01')).toBe('Jan 1');
  });

  it('formats December 31 correctly', () => {
    expect(formatDueDate('2026-12-31')).toBe('Dec 31');
  });
});
