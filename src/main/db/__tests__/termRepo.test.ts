import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import { createCourse, getCourse } from '../repositories/courseRepo';
import { listTerms, getTerm, createTerm, updateTerm, deleteTerm } from '../repositories/termRepo';

beforeEach(() => {
  mockDb.current = createTestDb();
});

describe('termRepo', () => {
  // ── listTerms ───────────────────────────────────────────────────────────────

  describe('listTerms', () => {
    it('returns empty array when no terms exist', () => {
      expect(listTerms()).toEqual([]);
    });

    it('orders by start_date DESC (later semester first)', () => {
      createTerm({ name: 'Spring 2026', startDate: '2026-01-15' });
      createTerm({ name: 'Fall 2026',   startDate: '2026-08-01' });
      const list = listTerms();
      expect(list[0].name).toBe('Fall 2026');
      expect(list[1].name).toBe('Spring 2026');
    });

    it('falls back to name order when start_dates are null', () => {
      createTerm({ name: 'Zeta' });
      createTerm({ name: 'Alpha' });
      const list = listTerms();
      expect(list[0].name).toBe('Alpha');
      expect(list[1].name).toBe('Zeta');
    });
  });

  // ── getTerm ─────────────────────────────────────────────────────────────────

  describe('getTerm', () => {
    it('returns null for a nonexistent id', () => {
      expect(getTerm('nope')).toBeNull();
    });

    it('returns the term for a valid id', () => {
      const t = createTerm({ name: 'Fall 2026' });
      const found = getTerm(t.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Fall 2026');
    });
  });

  // ── createTerm ──────────────────────────────────────────────────────────────

  describe('createTerm', () => {
    it('creates a term with just a name', () => {
      const t = createTerm({ name: 'Summer 2026' });
      expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(t.name).toBe('Summer 2026');
      expect(t.start_date).toBeNull();
      expect(t.end_date).toBeNull();
    });

    it('stores start and end dates', () => {
      const t = createTerm({ name: 'Fall 2026', startDate: '2026-08-01', endDate: '2026-12-15' });
      expect(t.start_date).toBe('2026-08-01');
      expect(t.end_date).toBe('2026-12-15');
    });

    it('creates with only startDate', () => {
      const t = createTerm({ name: 'T', startDate: '2026-08-01' });
      expect(t.start_date).toBe('2026-08-01');
      expect(t.end_date).toBeNull();
    });

    it('creates with only endDate', () => {
      const t = createTerm({ name: 'T', endDate: '2026-12-15' });
      expect(t.start_date).toBeNull();
      expect(t.end_date).toBe('2026-12-15');
    });
  });

  // ── updateTerm ──────────────────────────────────────────────────────────────

  describe('updateTerm', () => {
    it('updates name', () => {
      const t = createTerm({ name: 'Old' });
      expect(updateTerm(t.id, { name: 'New' }).name).toBe('New');
    });

    it('updates startDate', () => {
      const t = createTerm({ name: 'T' });
      expect(updateTerm(t.id, { startDate: '2026-09-01' }).start_date).toBe('2026-09-01');
    });

    it('updates endDate', () => {
      const t = createTerm({ name: 'T' });
      expect(updateTerm(t.id, { endDate: '2026-12-31' }).end_date).toBe('2026-12-31');
    });

    it('nulls out startDate', () => {
      const t = createTerm({ name: 'T', startDate: '2026-09-01' });
      expect(updateTerm(t.id, { startDate: null }).start_date).toBeNull();
    });

    it('nulls out endDate', () => {
      const t = createTerm({ name: 'T', endDate: '2026-12-31' });
      expect(updateTerm(t.id, { endDate: null }).end_date).toBeNull();
    });

    it('returns the unchanged row when input is empty', () => {
      const t = createTerm({ name: 'Same' });
      expect(updateTerm(t.id, {}).name).toBe('Same');
    });

    it('updates all fields at once', () => {
      const t = createTerm({ name: 'Old', startDate: '2026-01-01', endDate: '2026-05-15' });
      const u = updateTerm(t.id, { name: 'New', startDate: '2026-08-01', endDate: '2026-12-15' });
      expect(u.name).toBe('New');
      expect(u.start_date).toBe('2026-08-01');
      expect(u.end_date).toBe('2026-12-15');
    });
  });

  // ── deleteTerm ──────────────────────────────────────────────────────────────

  describe('deleteTerm', () => {
    it('removes the term', () => {
      const t = createTerm({ name: 'Del' });
      deleteTerm(t.id);
      expect(getTerm(t.id)).toBeNull();
    });

    it('nulls out term_id on courses that referenced it', () => {
      const t = createTerm({ name: 'Fall 2026' });
      const c = createCourse({ name: 'CS 101', abbreviation: 'CS', color: '#abc', termId: t.id });
      expect(c.term_id).toBe(t.id);
      deleteTerm(t.id);
      expect(getCourse(c.id)!.term_id).toBeNull();
    });

    it('does not affect courses on other terms', () => {
      const t1 = createTerm({ name: 'Fall 2026' });
      const t2 = createTerm({ name: 'Spring 2026' });
      const c = createCourse({ name: 'CS 101', abbreviation: 'CS', color: '#abc', termId: t2.id });
      deleteTerm(t1.id);
      expect(getCourse(c.id)!.term_id).toBe(t2.id);
    });

    it('is a no-op for a nonexistent id', () => {
      expect(() => deleteTerm('nope')).not.toThrow();
    });
  });
});
