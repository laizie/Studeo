import { describe, it, expect } from 'vitest';
import { parseReminderIndex } from '../remindersScript';

// The index that stops the duplicate runaway. A create is two steps from our
// side — make the reminder, return its id — and a script killed between them
// leaves a reminder with no link, which the next pass duplicates. Reading the
// list first lets that orphan be adopted instead.

describe('parseReminderIndex', () => {
  it('maps each title to its reminder id', () => {
    const index = parseReminderIndex('x-001\tProblem Set 3\nx-002\tLab 4\n');
    expect(index.get('Problem Set 3')).toBe('x-001');
    expect(index.get('Lab 4')).toBe('x-002');
    expect(index.size).toBe(2);
  });

  it('adopts the oldest of a set of duplicates', () => {
    // Reminders returns list order, so the first is the one that has been on
    // the phone longest — the one worth keeping a link to.
    const index = parseReminderIndex('old\tEssay\nnewer\tEssay\nnewest\tEssay\n');
    expect(index.get('Essay')).toBe('old');
    expect(index.size).toBe(1);
  });

  it('keeps titles that contain spaces, colons and punctuation intact', () => {
    // Split on the FIRST tab only: assignment titles routinely carry colons,
    // dashes and apostrophes, and one of them must not truncate the key.
    const index = parseReminderIndex("id-9\tCh. 4: Newton's Laws — problems 1-20\n");
    expect(index.get("Ch. 4: Newton's Laws — problems 1-20")).toBe('id-9');
  });

  it('ignores blank lines and lines with no tab', () => {
    expect(parseReminderIndex('\n\nnot-a-row\nid-1\tReal\n\n').size).toBe(1);
  });

  it('is empty for empty output rather than throwing', () => {
    expect(parseReminderIndex('').size).toBe(0);
  });
});
