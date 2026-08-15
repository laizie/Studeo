import { describe, it, expect } from 'vitest';
import { planReminderSync, type ReminderLink } from '../appleReminderSync';
import type { Assignment, AssignmentType, Course } from '../types';

const NOW = new Date(2026, 7, 15, 10, 0); // Aug 15 2026, local

function course(id: string, abbreviation: string, name = `${abbreviation} course`): Course {
  return {
    id, name, abbreviation, color: '#123456',
    building: null, term_id: 't1', grade_weights: null, created_at: '2026-08-01',
  };
}

function assign(
  id: string,
  dueDate: string,
  overrides: Partial<Assignment> = {},
): Assignment {
  return {
    id, course_id: 'c1', name: `Task ${id}`, type: 'Homework' as AssignmentType,
    status: 'not_started', due_date: dueDate, due_time: null, notes: null,
    score: null, points_possible: null, completed_at: null, created_at: '2026-08-01',
    ...overrides,
  };
}

const COURSES = [course('c1', 'CSC 316'), course('c2', 'BIO 181')];

function link(assignmentId: string, signature: string, reminderId = `rem-${assignmentId}`): ReminderLink {
  return { assignment_id: assignmentId, reminder_id: reminderId, signature };
}

/** The signature the planner would produce for an assignment with no link yet. */
function signatureFor(assignment: Assignment, courses = COURSES): string {
  const [created] = planReminderSync([assignment], courses, [], NOW).create;
  return created.signature;
}

describe('creating', () => {
  it('mirrors an upcoming assignment, course code first', () => {
    const plan = planReminderSync([assign('a', '2026-08-20')], COURSES, [], NOW);

    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].title).toBe('CSC 316 — Task a');
    expect(plan.create[0].due).toEqual({ year: 2026, month: 8, day: 20, hour: 9, minute: 0 });
    expect(plan.update).toEqual([]);
  });

  it('uses the due time when there is one', () => {
    const plan = planReminderSync([assign('a', '2026-08-20', { due_time: '23:59' })], COURSES, [], NOW);
    expect(plan.create[0].due).toMatchObject({ hour: 23, minute: 59 });
  });

  it('puts the type, course, and your own notes in the body — the bit you read after tapping', () => {
    const plan = planReminderSync(
      [assign('a', '2026-08-20', { type: 'Exam', notes: 'ch. 4-6, closed book' })],
      COURSES, [], NOW,
    );
    expect(plan.create[0].body).toBe('Exam · CSC 316 course\n\nch. 4-6, closed book');
  });

  it('falls back to the bare name when the course is missing', () => {
    const plan = planReminderSync([assign('a', '2026-08-20', { course_id: 'gone' })], COURSES, [], NOW);
    expect(plan.create[0].title).toBe('Task a');
  });

  it('does not mirror something already finished, or beyond the horizon', () => {
    const plan = planReminderSync(
      [
        assign('done', '2026-08-20', { status: 'completed' }),
        assign('far', '2027-01-01'),
      ],
      COURSES, [], NOW,
    );
    expect(plan.create).toEqual([]);
    expect(plan.complete).toEqual([]); // never linked, so nothing to tick off
  });

  it('still mirrors something recently overdue — that is when you most need it', () => {
    const plan = planReminderSync([assign('late', '2026-08-13')], COURSES, [], NOW);
    expect(plan.create).toHaveLength(1);
  });

  it('stops mirroring an assignment left undone past the grace period', () => {
    const plan = planReminderSync([assign('ancient', '2026-07-01')], COURSES, [], NOW);
    expect(plan.create).toEqual([]);
  });
});

describe('updating', () => {
  it('skips an assignment whose reminder is already correct', () => {
    const assignment = assign('a', '2026-08-20');
    const plan = planReminderSync([assignment], COURSES, [link('a', signatureFor(assignment))], NOW);

    expect(plan).toEqual({ create: [], update: [], complete: [], remove: [] });
  });

  it('updates when the due date moves', () => {
    const original = assign('a', '2026-08-20');
    const moved = assign('a', '2026-08-27');
    const plan = planReminderSync([moved], COURSES, [link('a', signatureFor(original))], NOW);

    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].reminderId).toBe('rem-a');
    expect(plan.update[0].reminder.due.day).toBe(27);
    expect(plan.create).toEqual([]); // updated in place, not duplicated
  });

  it('updates when the name or notes change', () => {
    const original = assign('a', '2026-08-20');
    const renamed = assign('a', '2026-08-20', { name: 'Project 2 (revised)' });
    const annotated = assign('a', '2026-08-20', { notes: 'submit on Canvas' });

    expect(planReminderSync([renamed], COURSES, [link('a', signatureFor(original))], NOW).update).toHaveLength(1);
    expect(planReminderSync([annotated], COURSES, [link('a', signatureFor(original))], NOW).update).toHaveLength(1);
  });
});

describe('finishing and removing', () => {
  it('ticks off a linked assignment that got completed, rather than deleting it', () => {
    const assignment = assign('a', '2026-08-20');
    const done = assign('a', '2026-08-20', { status: 'completed' });
    const plan = planReminderSync([done], COURSES, [link('a', signatureFor(assignment))], NOW);

    expect(plan.complete).toEqual([{ assignmentId: 'a', reminderId: 'rem-a' }]);
    expect(plan.remove).toEqual([]);
  });

  it('removes the mirror when an assignment is deleted in Studeo', () => {
    const plan = planReminderSync([], COURSES, [link('gone', 'whatever')], NOW);
    expect(plan.remove).toEqual([{ assignmentId: 'gone', reminderId: 'rem-gone' }]);
  });

  it('removes the mirror when an unfinished assignment ages out', () => {
    const plan = planReminderSync([assign('stale', '2026-07-01')], COURSES, [link('stale', 'sig')], NOW);
    expect(plan.remove).toEqual([{ assignmentId: 'stale', reminderId: 'rem-stale' }]);
  });
});

describe('dates are local, not UTC', () => {
  it('keeps the due day the user typed', () => {
    // new Date('2026-08-20') parses as UTC and renders as the 19th anywhere west
    // of Greenwich — the off-by-one that AUDIT H6 found in the due filters.
    const plan = planReminderSync([assign('a', '2026-08-20')], COURSES, [], NOW);
    expect(plan.create[0].due).toMatchObject({ month: 8, day: 20 });
  });

  it('treats the horizon boundary by day, not by hour', () => {
    // 60 days out from Aug 15 is Oct 14. A late-evening "now" must not push it over.
    const lateEvening = new Date(2026, 7, 15, 23, 59);
    const plan = planReminderSync([assign('edge', '2026-10-14')], COURSES, [], lateEvening);
    expect(plan.create).toHaveLength(1);
  });
});

describe('a realistic mixed sync', () => {
  it('sorts every assignment into exactly one bucket', () => {
    const unchanged = assign('u', '2026-08-20');
    const moved = assign('m', '2026-08-21');

    const plan = planReminderSync(
      [
        unchanged,
        assign('m', '2026-08-28'),                              // link exists, date moved
        assign('d', '2026-08-22', { status: 'completed' }),     // finished
        assign('n', '2026-08-25', { course_id: 'c2' }),         // brand new
        assign('old', '2026-06-01'),                            // aged out, linked
      ],
      COURSES,
      [
        link('u', signatureFor(unchanged)),
        link('m', signatureFor(moved)),
        link('d', 'any'),
        link('old', 'any'),
        link('deleted', 'any'),                                 // assignment is gone
      ],
      NOW,
    );

    expect(plan.create.map(r => r.assignmentId)).toEqual(['n']);
    expect(plan.update.map(u => u.reminder.assignmentId)).toEqual(['m']);
    expect(plan.complete.map(c => c.assignmentId)).toEqual(['d']);
    expect(plan.remove.map(r => r.assignmentId).sort()).toEqual(['deleted', 'old']);
  });
});
