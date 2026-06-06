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
} from '../repositories/courseRepo';

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
    });
  });
});
