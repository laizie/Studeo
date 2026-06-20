import { describe, it, expect } from 'vitest';
import { parseIcs } from '../icsParser';

// Build expected local date/time the same way the parser does, so these
// assertions hold regardless of the machine's timezone (mirrors the note in
// deadlines.test.ts about UTC vs local).
function localFromUtc(y: number, mo: number, d: number, h: number, mi: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}

// A small Canvas-style feed. Uses CRLF line endings like a real feed.
function feed(...events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Instructure//Canvas//EN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

const VEVENT = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

describe('parseIcs', () => {
  it('parses a Canvas assignment event with a UTC due time', () => {
    const text = feed(VEVENT([
      'DTSTART:20260116T045900Z',
      'DTEND:20260116T045900Z',
      'UID:event-assignment-12345@school.instructure.com',
      'SUMMARY:Homework 3 [CS 101]',
    ]));

    const events = parseIcs(text);
    expect(events).toHaveLength(1);

    const expected = localFromUtc(2026, 1, 16, 4, 59);
    expect(events[0]).toMatchObject({
      title: 'Homework 3',
      courseLabel: 'CS 101',
      type: 'Homework',
      isAssignment: true,
      dueDate: expected.date,
      dueTime: expected.time,
    });
  });

  it('treats VALUE=DATE as an all-day due date with no time', () => {
    const text = feed(VEVENT([
      'DTSTART;VALUE=DATE:20260301',
      'UID:event-assignment-9@school.instructure.com',
      'SUMMARY:Final Project [CS 101]',
    ]));

    const [event] = parseIcs(text);
    expect(event.dueDate).toBe('2026-03-01'); // literal — no timezone math
    expect(event.dueTime).toBeNull();
    expect(event.type).toBe('Project');
  });

  it('unfolds long lines split across continuations', () => {
    // SUMMARY folded onto a second physical line (CRLF + leading space).
    const text = feed(VEVENT([
      'DTSTART;VALUE=DATE:20260210',
      'UID:event-assignment-7@school.instructure.com',
      'SUMMARY:Reading: chapters one through\r\n  three [HIST 200]',
    ]));

    const [event] = parseIcs(text);
    expect(event.title).toBe('Reading: chapters one through three');
    expect(event.courseLabel).toBe('HIST 200');
    expect(event.type).toBe('Reading');
  });

  it('decodes iCalendar escape sequences in the summary', () => {
    const text = feed(VEVENT([
      'DTSTART;VALUE=DATE:20260105',
      'UID:event-assignment-3@school.instructure.com',
      'SUMMARY:Lab 1\\, part 2 [CHEM 101]',
    ]));

    const [event] = parseIcs(text);
    expect(event.title).toBe('Lab 1, part 2');
    expect(event.type).toBe('Lab');
  });

  it('flags generic calendar events as not assignments', () => {
    const text = feed(VEVENT([
      'DTSTART;VALUE=DATE:20260220',
      'UID:event-calendar-event-55@school.instructure.com',
      'SUMMARY:Office Hours [CS 101]',
    ]));

    const [event] = parseIcs(text);
    expect(event.isAssignment).toBe(false);
  });

  it('keeps a summary with no bracketed course label', () => {
    const text = feed(VEVENT([
      'DTSTART;VALUE=DATE:20260220',
      'UID:event-assignment-8@school.instructure.com',
      'SUMMARY:Quiz 2',
    ]));

    const [event] = parseIcs(text);
    expect(event.title).toBe('Quiz 2');
    expect(event.courseLabel).toBeNull();
    expect(event.type).toBe('Quiz');
  });

  it('parses multiple events and ignores the calendar wrapper', () => {
    const text = feed(
      VEVENT([
        'DTSTART;VALUE=DATE:20260301',
        'UID:event-assignment-1@school.instructure.com',
        'SUMMARY:HW 1 [CS 101]',
      ]),
      VEVENT([
        'DTSTART;VALUE=DATE:20260308',
        'UID:event-assignment-2@school.instructure.com',
        'SUMMARY:HW 2 [CS 101]',
      ]),
    );

    const events = parseIcs(text);
    expect(events.map(e => e.title)).toEqual(['HW 1', 'HW 2']);
  });

  it('skips events missing a summary or start date', () => {
    const text = feed(
      VEVENT([
        'UID:event-assignment-x@school.instructure.com',
        'SUMMARY:No date here [CS 101]',
      ]),
      VEVENT([
        'DTSTART;VALUE=DATE:20260301',
        'UID:event-assignment-y@school.instructure.com',
      ]),
    );

    expect(parseIcs(text)).toHaveLength(0);
  });

  it('returns an empty list for text that is not a calendar', () => {
    expect(parseIcs('just some random text')).toEqual([]);
  });
});
