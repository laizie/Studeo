import { describe, it, expect } from 'vitest';
import type { Assignment, Course, Task } from '../types';
import { resolveFocusList } from '../focusList';

function course(over: Partial<Course> = {}): Course {
  return {
    id: 'c1', name: 'Calculus III', abbreviation: 'MAT-273', color: '#6393e1',
    building: null, term_id: null, grade_weights: null, created_at: '', ...over,
  };
}

function assignment(over: Partial<Assignment> = {}): Assignment {
  return {
    id: 'a1', course_id: 'c1', name: 'Problem set 4', type: 'Homework',
    status: 'not_started', due_date: '2026-09-10', due_time: null, notes: null,
    score: null, points_possible: null, completed_at: null, created_at: '', ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', name: 'Email the TA', status: 'not_started',
    due_date: '2026-09-10', completed_at: null, created_at: '', ...over,
  };
}

describe('resolveFocusList', () => {
  it('reads done from the row, so a tick anywhere else shows here', () => {
    // The bug this replaced: the list kept its own done flag, which only its own
    // checkbox wrote. Completing the assignment on its course page left the focus
    // list showing it unticked.
    const done = assignment({ status: 'completed' });
    const [item] = resolveFocusList([{ id: 'a1', type: 'assignment' }], [done], [], [course()]);
    expect(item.done).toBe(true);
  });

  it('reads done from a task row too', () => {
    const [item] = resolveFocusList([{ id: 't1', type: 'task' }], [], [task({ status: 'completed' })], []);
    expect(item.done).toBe(true);
  });

  it('treats every other status as not done', () => {
    const [item] = resolveFocusList([{ id: 'a1', type: 'assignment' }], [assignment({ status: 'in_progress' })], [], []);
    expect(item.done).toBe(false);
  });

  it('takes the name from the row, so a rename shows here', () => {
    const renamed = assignment({ name: 'Problem set 4 (revised)' });
    const [item] = resolveFocusList([{ id: 'a1', type: 'assignment' }], [renamed], [], [course()]);
    expect(item.name).toBe('Problem set 4 (revised)');
  });

  it('names the course from the assignment, wherever it was added from', () => {
    const [item] = resolveFocusList([{ id: 'a1', type: 'assignment' }], [assignment()], [], [course()]);
    expect(item.courseName).toBe('MAT-273');
    expect(item.courseColor).toBe('#6393e1');
  });

  it('falls back to the course name when it has no abbreviation', () => {
    const [item] = resolveFocusList(
      [{ id: 'a1', type: 'assignment' }], [assignment()], [], [course({ abbreviation: '' })],
    );
    expect(item.courseName).toBe('Calculus III');
  });

  it('leaves the course off a task, which belongs to none', () => {
    const [item] = resolveFocusList([{ id: 't1', type: 'task' }], [], [task()], [course()]);
    expect(item.courseName).toBeUndefined();
  });

  it('skips an entry whose row was deleted', () => {
    const items = resolveFocusList(
      [{ id: 'a1', type: 'assignment' }, { id: 'gone', type: 'assignment' }],
      [assignment()], [], [course()],
    );
    expect(items.map(i => i.id)).toEqual(['a1']);
  });

  it('skips an assignment id listed as a task (and the reverse)', () => {
    expect(resolveFocusList([{ id: 'a1', type: 'task' }], [assignment()], [], [])).toEqual([]);
    expect(resolveFocusList([{ id: 't1', type: 'assignment' }], [], [task()], [])).toEqual([]);
  });

  it('resolves an assignment whose course is missing, without the course fields', () => {
    const [item] = resolveFocusList([{ id: 'a1', type: 'assignment' }], [assignment()], [], []);
    expect(item.name).toBe('Problem set 4');
    expect(item.courseName).toBeUndefined();
  });

  it('keeps the order things were added in', () => {
    const items = resolveFocusList(
      [{ id: 't1', type: 'task' }, { id: 'a1', type: 'assignment' }],
      [assignment()], [task()], [course()],
    );
    expect(items.map(i => i.id)).toEqual(['t1', 'a1']);
  });

  it('returns nothing for an empty list', () => {
    expect(resolveFocusList([], [assignment()], [task()], [course()])).toEqual([]);
  });
});
