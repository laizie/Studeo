import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import {
  listStudySessions,
  getStudySession,
  createStudySession,
  updateStudySession,
} from '../repositories/studySessionRepo';
import { createCourse } from '../repositories/courseRepo';

beforeEach(() => {
  mockDb.current = createTestDb();
});

describe('studySessionRepo', () => {
  describe('createStudySession', () => {
    it('creates a focus session with all fields', () => {
      const s = createStudySession({
        startedAt: '2026-06-11T15:00:00.000Z',
        durationSeconds: 1500,
        kind: 'focus',
      });
      expect(s.id).toBeTruthy();
      expect(s.started_at).toBe('2026-06-11T15:00:00.000Z');
      expect(s.duration_seconds).toBe(1500);
      expect(s.kind).toBe('focus');
      expect(s.course_id).toBeNull();
      expect(s.intention).toBeNull();
      expect(s.reflection).toBeNull();
    });

    it('stores an optional intention, trimming blanks to null', () => {
      const withIntent = createStudySession({
        startedAt: '2026-06-11T15:00:00.000Z', durationSeconds: 1500, kind: 'focus',
        intention: '  Finish the lab report  ',
      });
      expect(withIntent.intention).toBe('Finish the lab report');

      const blank = createStudySession({
        startedAt: '2026-06-11T16:00:00.000Z', durationSeconds: 1500, kind: 'focus',
        intention: '   ',
      });
      expect(blank.intention).toBeNull();
    });

    it('stores an optional course link', () => {
      const course = createCourse({ name: 'Calc II', abbreviation: 'MA241', color: '#6393e1' });
      const s = createStudySession({
        startedAt: '2026-06-11T15:00:00.000Z',
        durationSeconds: 1500,
        kind: 'focus',
        courseId: course.id,
      });
      expect(s.course_id).toBe(course.id);
    });

    it('accepts break kinds', () => {
      const short = createStudySession({ startedAt: '2026-06-11T15:00:00.000Z', durationSeconds: 300, kind: 'short_break' });
      const long  = createStudySession({ startedAt: '2026-06-11T16:00:00.000Z', durationSeconds: 900, kind: 'long_break' });
      expect(short.kind).toBe('short_break');
      expect(long.kind).toBe('long_break');
    });
  });

  describe('listStudySessions', () => {
    it('returns empty array when none exist', () => {
      expect(listStudySessions()).toEqual([]);
    });

    it('orders sessions newest-first', () => {
      createStudySession({ startedAt: '2026-06-10T10:00:00.000Z', durationSeconds: 1500, kind: 'focus' });
      createStudySession({ startedAt: '2026-06-11T10:00:00.000Z', durationSeconds: 1500, kind: 'focus' });
      const list = listStudySessions();
      expect(list).toHaveLength(2);
      expect(list[0].started_at).toBe('2026-06-11T10:00:00.000Z');
    });
  });

  describe('getStudySession', () => {
    it('returns null for a nonexistent id', () => {
      expect(getStudySession('nope')).toBeNull();
    });
  });

  describe('updateStudySession', () => {
    it('attaches a reflection without touching other fields', () => {
      const s = createStudySession({
        startedAt: '2026-06-11T15:00:00.000Z', durationSeconds: 1500, kind: 'focus',
        intention: 'Read chapter 4',
      });
      const updated = updateStudySession(s.id, { reflection: 'Got through most of it' });
      expect(updated.reflection).toBe('Got through most of it');
      expect(updated.intention).toBe('Read chapter 4');
      expect(updated.duration_seconds).toBe(1500);
    });

    it('clears a reflection when passed null', () => {
      const s = createStudySession({ startedAt: '2026-06-11T15:00:00.000Z', durationSeconds: 1500, kind: 'focus' });
      updateStudySession(s.id, { reflection: 'first pass' });
      const cleared = updateStudySession(s.id, { reflection: null });
      expect(cleared.reflection).toBeNull();
    });
  });
});
