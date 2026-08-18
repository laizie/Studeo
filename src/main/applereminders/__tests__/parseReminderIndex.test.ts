import { describe, it, expect } from 'vitest';
import { parseReminderIndex } from '../remindersScript';

const UNIT = String.fromCharCode(31);
const RECORD = String.fromCharCode(30);
/** Build what the AppleScript emits: an id column and a title column. */
const payload = (rows: [id: string, title: string, done?: boolean][]) =>
  rows.map(r => r[0]).join(UNIT) + RECORD +
  rows.map(r => r[1]).join(UNIT) + RECORD +
  rows.map(r => String(r[2] ?? false)).join(UNIT);

// The index that stops the duplicate runaway. A create is two steps from our
// side — make the reminder, return its id — and a script killed between them
// leaves a reminder with no link, which the next pass duplicates. Reading the
// list first lets that orphan be adopted instead.

describe('parseReminderIndex', () => {
  it('maps each title to its reminder id', () => {
    const index = parseReminderIndex(payload([['x-001', 'Problem Set 3'], ['x-002', 'Lab 4']]));
    expect(index.get('Problem Set 3')).toBe('x-001');
    expect(index.get('Lab 4')).toBe('x-002');
    expect(index.size).toBe(2);
  });

  it('adopts the oldest of a set of duplicates', () => {
    // Reminders returns list order, so the first is the one that has been on
    // the phone longest — the one worth keeping a link to.
    const index = parseReminderIndex(payload([['old', 'Essay'], ['newer', 'Essay'], ['newest', 'Essay']]));
    expect(index.get('Essay')).toBe('old');
    expect(index.size).toBe(1);
  });

  it('keeps a title containing commas, tabs and newlines intact', () => {
    // The columns are joined with control characters for exactly this reason:
    // real titles carry punctuation, and the first attempt at this split on tab,
    // which any of these would have truncated or desynced.
    const messy = "Ch. 4: Newton's Laws\ttable, part 2\nsecond line";
    const index = parseReminderIndex(payload([['id-9', messy]]));
    expect(index.get(messy)).toBe('id-9');
  });

  it('refuses to pair columns of different lengths', () => {
    // Ids and titles are two separate fetches. If they disagree, pairing is
    // guesswork — and a wrong pair links an assignment to another reminder.
    // An empty index reads as "couldn't check", which is the safe direction.
    const desynced = ['a', 'b', 'c'].join(UNIT) + RECORD + ['one', 'two'].join(UNIT) +
      RECORD + ['false', 'false'].join(UNIT);
    expect(parseReminderIndex(desynced).size).toBe(0);
  });

  it('skips reminders that are already ticked off', () => {
    // Adopting a completed reminder would link the assignment to work that
    // shows as already done. The flag is fetched as a third column and
    // filtered here, because asking Reminders to filter costs more than
    // fetching it.
    const index = parseReminderIndex(payload([
      ['done-1', 'Essay', true],
      ['open-1', 'Essay', false],
      ['done-2', 'Lab', true],
    ]));
    expect(index.get('Essay')).toBe('open-1');
    expect(index.has('Lab')).toBe(false);
  });

  it('is empty when the separator is missing entirely', () => {
    expect(parseReminderIndex('garbage with no record separator').size).toBe(0);
  });

  it('is empty for empty output rather than throwing', () => {
    expect(parseReminderIndex('').size).toBe(0);
  });
});
