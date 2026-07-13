import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  restoreCourse,
} from '../repositories/courseRepo';
import { createAssignment, listAssignments } from '../repositories/assignmentRepo';
import { createSubtask, listSubtasks } from '../repositories/subtaskRepo';
import { createClassMeeting, listClassMeetings } from '../repositories/classMeetingRepo';
import { createStudySession, listStudySessions } from '../repositories/studySessionRepo';

beforeEach(() => {
  mockDb.current = createTestDb();
});

describe('courseRepo', () => {
  // ── listCourses ─────────────────────────────────────────────────────────────

  describe('listCourses', () => {
    it('returns empty array when no courses exist', () => {
      expect(listCourses()).toEqual([]);
    });

    it('returns all courses ordered by name', () => {
      createCourse({ name: 'Zoology', abbreviation: 'ZOO', color: '#111' });
      createCourse({ name: 'Algebra', abbreviation: 'ALG', color: '#222' });
      const list = listCourses();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('Algebra');
      expect(list[1].name).toBe('Zoology');
    });
  });

  // ── getCourse ───────────────────────────────────────────────────────────────

  describe('getCourse', () => {
    it('returns null for a nonexistent id', () => {
      expect(getCourse('does-not-exist')).toBeNull();
    });

    it('returns the correct course by id', () => {
      const c = createCourse({ name: 'Biology', abbreviation: 'BIO', color: '#0f0' });
      const found = getCourse(c.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Biology');
      expect(found!.id).toBe(c.id);
    });
  });

  // ── createCourse ────────────────────────────────────────────────────────────

  describe('createCourse', () => {
    it('creates a course with required fields and null optionals', () => {
      const c = createCourse({ name: 'Math', abbreviation: 'MTH', color: '#123456' });
      expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(c.name).toBe('Math');
      expect(c.abbreviation).toBe('MTH');
      expect(c.color).toBe('#123456');
      expect(c.building).toBeNull();
      expect(c.term_id).toBeNull();
      expect(c.created_at).toBeDefined();
    });

    it('stores an optional building', () => {
      const c = createCourse({ name: 'Physics', abbreviation: 'PHY', color: '#abc', building: 'Science Hall' });
      expect(c.building).toBe('Science Hall');
    });

    it('stores an optional termId', () => {
      mockDb.current!.exec(`INSERT INTO terms VALUES ('t1','Fall 2026',NULL,NULL)`);
      const c = createCourse({ name: 'Chem', abbreviation: 'CHM', color: '#def', termId: 't1' });
      expect(c.term_id).toBe('t1');
    });
  });

  // ── updateCourse ────────────────────────────────────────────────────────────

  describe('updateCourse', () => {
    it('updates name only', () => {
      const c = createCourse({ name: 'Old', abbreviation: 'OLD', color: '#111' });
      const u = updateCourse(c.id, { name: 'New' });
      expect(u.name).toBe('New');
      expect(u.abbreviation).toBe('OLD');
    });

    it('updates abbreviation only', () => {
      const c = createCourse({ name: 'Test', abbreviation: 'OLD', color: '#111' });
      expect(updateCourse(c.id, { abbreviation: 'NEW' }).abbreviation).toBe('NEW');
    });

    it('updates color only', () => {
      const c = createCourse({ name: 'Test', abbreviation: 'TST', color: '#111' });
      expect(updateCourse(c.id, { color: '#999' }).color).toBe('#999');
    });

    it('sets building to a value', () => {
      const c = createCourse({ name: 'Test', abbreviation: 'TST', color: '#111' });
      expect(updateCourse(c.id, { building: 'New Hall' }).building).toBe('New Hall');
    });

    it('nulls out building', () => {
      const c = createCourse({ name: 'Test', abbreviation: 'TST', color: '#111', building: 'Old Hall' });
      expect(updateCourse(c.id, { building: null }).building).toBeNull();
    });

    it('sets termId', () => {
      mockDb.current!.exec(`INSERT INTO terms VALUES ('t1','Spring',NULL,NULL)`);
      const c = createCourse({ name: 'Test', abbreviation: 'TST', color: '#111' });
      expect(updateCourse(c.id, { termId: 't1' }).term_id).toBe('t1');
    });

    it('nulls out termId', () => {
      mockDb.current!.exec(`INSERT INTO terms VALUES ('t1','Spring',NULL,NULL)`);
      const c = createCourse({ name: 'Test', abbreviation: 'TST', color: '#111', termId: 't1' });
      expect(updateCourse(c.id, { termId: null }).term_id).toBeNull();
    });

    it('returns unchanged course when input is empty', () => {
      const c = createCourse({ name: 'Same', abbreviation: 'SAM', color: '#111' });
      const u = updateCourse(c.id, {});
      expect(u.name).toBe('Same');
    });

    it('updates multiple fields at once', () => {
      const c = createCourse({ name: 'Old', abbreviation: 'OLD', color: '#111' });
      const u = updateCourse(c.id, { name: 'New', abbreviation: 'NEW', color: '#999' });
      expect(u.name).toBe('New');
      expect(u.abbreviation).toBe('NEW');
      expect(u.color).toBe('#999');
    });
  });

  // ── deleteCourse ────────────────────────────────────────────────────────────

  describe('deleteCourse', () => {
    it('removes the course from the database', () => {
      const c = createCourse({ name: 'Delete Me', abbreviation: 'DEL', color: '#000' });
      deleteCourse(c.id);
      expect(getCourse(c.id)).toBeNull();
    });

    it('is a no-op for a nonexistent id', () => {
      expect(() => deleteCourse('nonexistent')).not.toThrow();
      expect(deleteCourse('nonexistent')).toBeNull();
    });

    it('succeeds even when a study session references the course', () => {
      // study_sessions.course_id has no ON DELETE rule, so with foreign keys
      // enforced (as in production) an un-nulled reference makes the whole
      // delete fail. This is the regression guard for that.
      const c = createCourse({ name: 'Studied', abbreviation: 'STD', color: '#111' });
      createStudySession({ startedAt: '2026-03-01T10:00:00Z', durationSeconds: 1500, kind: 'focus', courseId: c.id });

      expect(() => deleteCourse(c.id)).not.toThrow();
      expect(getCourse(c.id)).toBeNull();

      // The session survives — study history isn't the course's to take with it.
      const sessions = listStudySessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].course_id).toBeNull();
    });

    it('returns a snapshot of everything it deleted', () => {
      const c = createCourse({ name: 'Physics', abbreviation: 'PHY', color: '#111' });
      const a = createAssignment({ courseId: c.id, name: 'Lab 1', type: 'Lab', dueDate: '2026-03-10' });
      createSubtask({ assignmentId: a.id, name: 'Read the manual' });
      createClassMeeting({ courseId: c.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });

      const snap = deleteCourse(c.id)!;

      expect(snap.course.id).toBe(c.id);
      expect(snap.assignments).toHaveLength(1);
      expect(snap.subtasks).toHaveLength(1);
      expect(snap.classMeetings).toHaveLength(1);
      // Cascades really ran: the children are gone from the DB, not just the course.
      expect(listAssignments({ courseId: c.id })).toHaveLength(0);
    });
  });

  // ── restoreCourse (the Undo path) ───────────────────────────────────────────

  describe('restoreCourse', () => {
    it('puts the course and all its children back with the same ids', () => {
      const c = createCourse({ name: 'Physics', abbreviation: 'PHY', color: '#111', building: 'Sci 200' });
      const a = createAssignment({ courseId: c.id, name: 'Lab 1', type: 'Lab', dueDate: '2026-03-10' });
      const s = createSubtask({ assignmentId: a.id, name: 'Read the manual' });
      const m = createClassMeeting({ courseId: c.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      const session = createStudySession({
        startedAt: '2026-03-01T10:00:00Z', durationSeconds: 1500, kind: 'focus', courseId: c.id,
      });

      const snap = deleteCourse(c.id)!;
      restoreCourse(snap);

      const restored = getCourse(c.id);
      expect(restored).not.toBeNull();
      expect(restored!.name).toBe('Physics');
      expect(restored!.building).toBe('Sci 200');

      // Same ids everywhere — notes and links that pointed at these rows resolve again.
      const assignments = listAssignments({ courseId: c.id });
      expect(assignments).toHaveLength(1);
      expect(assignments[0].id).toBe(a.id);
      expect(assignments[0].name).toBe('Lab 1');

      const subtasks = listSubtasks({ assignmentId: a.id });
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].id).toBe(s.id);

      const meetings = listClassMeetings({ courseId: c.id });
      expect(meetings).toHaveLength(1);
      expect(meetings[0].id).toBe(m.id);

      // The study session is re-linked to the course it was logged against.
      const sessions = listStudySessions();
      expect(sessions.find(x => x.id === session.id)!.course_id).toBe(c.id);
    });

    it('restores a course that had no children', () => {
      const c = createCourse({ name: 'Empty', abbreviation: 'EMP', color: '#222' });
      const snap = deleteCourse(c.id)!;
      expect(() => restoreCourse(snap)).not.toThrow();
      expect(getCourse(c.id)).not.toBeNull();
    });
  });
});
