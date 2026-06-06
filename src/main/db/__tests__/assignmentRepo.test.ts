import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import { createCourse } from '../repositories/courseRepo';
import {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '../repositories/assignmentRepo';

let courseId: string;

beforeEach(() => {
  mockDb.current = createTestDb();
  courseId = createCourse({ name: 'CS 101', abbreviation: 'CS', color: '#abc' }).id;
});

describe('assignmentRepo', () => {
  // ── listAssignments ─────────────────────────────────────────────────────────

  describe('listAssignments', () => {
    it('returns empty array when no assignments exist', () => {
      expect(listAssignments()).toEqual([]);
    });

    it('returns all assignments with no filters', () => {
      createAssignment({ courseId, name: 'A1', dueDate: '2026-09-01' });
      createAssignment({ courseId, name: 'A2', dueDate: '2026-09-02' });
      expect(listAssignments()).toHaveLength(2);
    });

    it('orders results by due_date ascending', () => {
      createAssignment({ courseId, name: 'Later',   dueDate: '2026-09-10' });
      createAssignment({ courseId, name: 'Earlier', dueDate: '2026-09-01' });
      const list = listAssignments();
      expect(list[0].name).toBe('Earlier');
      expect(list[1].name).toBe('Later');
    });

    it('filters by courseId', () => {
      const other = createCourse({ name: 'Bio', abbreviation: 'BIO', color: '#0f0' });
      createAssignment({ courseId,       name: 'Mine',  dueDate: '2026-09-01' });
      createAssignment({ courseId: other.id, name: 'Theirs', dueDate: '2026-09-01' });
      const list = listAssignments({ courseId });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Mine');
    });

    it('filters by status', () => {
      createAssignment({ courseId, name: 'Done', dueDate: '2026-09-01', status: 'completed' });
      createAssignment({ courseId, name: 'Todo', dueDate: '2026-09-01', status: 'not_started' });
      const list = listAssignments({ status: 'completed' });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Done');
    });

    it('filters by both courseId and status', () => {
      const other = createCourse({ name: 'Bio', abbreviation: 'BIO', color: '#0f0' });
      createAssignment({ courseId,       name: 'Match',       dueDate: '2026-09-01', status: 'completed' });
      createAssignment({ courseId,       name: 'WrongStatus', dueDate: '2026-09-01', status: 'not_started' });
      createAssignment({ courseId: other.id, name: 'WrongCourse', dueDate: '2026-09-01', status: 'completed' });
      const list = listAssignments({ courseId, status: 'completed' });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Match');
    });
  });

  // ── getAssignment ───────────────────────────────────────────────────────────

  describe('getAssignment', () => {
    it('returns null for a nonexistent id', () => {
      expect(getAssignment('nope')).toBeNull();
    });

    it('returns the assignment for a valid id', () => {
      const a = createAssignment({ courseId, name: 'HW1', dueDate: '2026-09-01' });
      const found = getAssignment(a.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('HW1');
    });
  });

  // ── createAssignment ────────────────────────────────────────────────────────

  describe('createAssignment', () => {
    it('uses defaults for type and status', () => {
      const a = createAssignment({ courseId, name: 'HW', dueDate: '2026-09-01' });
      expect(a.type).toBe('Assignment');
      expect(a.status).toBe('not_started');
      expect(a.notes).toBeNull();
    });

    it('stores an explicit type', () => {
      const a = createAssignment({ courseId, name: 'Midterm', dueDate: '2026-10-01', type: 'Exam' });
      expect(a.type).toBe('Exam');
    });

    it('stores an explicit status', () => {
      const a = createAssignment({ courseId, name: 'Done', dueDate: '2026-09-01', status: 'completed' });
      expect(a.status).toBe('completed');
    });

    it('stores notes', () => {
      const a = createAssignment({ courseId, name: 'Notes', dueDate: '2026-09-01', notes: 'Read ch. 3' });
      expect(a.notes).toBe('Read ch. 3');
    });

    it('stores the courseId correctly', () => {
      const a = createAssignment({ courseId, name: 'Test', dueDate: '2026-09-01' });
      expect(a.course_id).toBe(courseId);
    });

    it('generates a UUID id and created_at timestamp', () => {
      const a = createAssignment({ courseId, name: 'Test', dueDate: '2026-09-01' });
      expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.created_at).toBeDefined();
    });
  });

  // ── updateAssignment ────────────────────────────────────────────────────────

  describe('updateAssignment', () => {
    it('updates name', () => {
      const a = createAssignment({ courseId, name: 'Old', dueDate: '2026-09-01' });
      expect(updateAssignment(a.id, { name: 'New' }).name).toBe('New');
    });

    it('updates type', () => {
      const a = createAssignment({ courseId, name: 'T', dueDate: '2026-09-01' });
      expect(updateAssignment(a.id, { type: 'Quiz' }).type).toBe('Quiz');
    });

    it('updates status', () => {
      const a = createAssignment({ courseId, name: 'T', dueDate: '2026-09-01' });
      expect(updateAssignment(a.id, { status: 'in_progress' }).status).toBe('in_progress');
    });

    it('updates dueDate', () => {
      const a = createAssignment({ courseId, name: 'T', dueDate: '2026-09-01' });
      expect(updateAssignment(a.id, { dueDate: '2026-12-01' }).due_date).toBe('2026-12-01');
    });

    it('updates notes to a string', () => {
      const a = createAssignment({ courseId, name: 'T', dueDate: '2026-09-01' });
      expect(updateAssignment(a.id, { notes: 'New note' }).notes).toBe('New note');
    });

    it('nulls out notes', () => {
      const a = createAssignment({ courseId, name: 'T', dueDate: '2026-09-01', notes: 'Old' });
      expect(updateAssignment(a.id, { notes: null }).notes).toBeNull();
    });

    it('returns the unchanged row when input is empty', () => {
      const a = createAssignment({ courseId, name: 'Same', dueDate: '2026-09-01' });
      expect(updateAssignment(a.id, {}).name).toBe('Same');
    });
  });

  // ── deleteAssignment ────────────────────────────────────────────────────────

  describe('deleteAssignment', () => {
    it('removes the assignment', () => {
      const a = createAssignment({ courseId, name: 'Del', dueDate: '2026-09-01' });
      deleteAssignment(a.id);
      expect(getAssignment(a.id)).toBeNull();
    });

    it('is a no-op for a nonexistent id', () => {
      expect(() => deleteAssignment('nope')).not.toThrow();
    });
  });

  // ── cascade ─────────────────────────────────────────────────────────────────

  describe('cascade', () => {
    it('deletes assignments when the parent course is deleted', () => {
      createAssignment({ courseId, name: 'Will cascade', dueDate: '2026-09-01' });
      mockDb.current!.exec(`DELETE FROM courses WHERE id = '${courseId}'`);
      expect(listAssignments({ courseId })).toHaveLength(0);
    });
  });
});
