import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import { createCourse } from '../repositories/courseRepo';
import {
  listClassMeetings,
  createClassMeeting,
  updateClassMeeting,
  deleteClassMeeting,
} from '../repositories/classMeetingRepo';

let courseId: string;

beforeEach(() => {
  mockDb.current = createTestDb();
  courseId = createCourse({ name: 'CS 101', abbreviation: 'CS', color: '#abc' }).id;
});

describe('classMeetingRepo', () => {
  // ── listClassMeetings ───────────────────────────────────────────────────────

  describe('listClassMeetings', () => {
    it('returns empty array when no meetings exist', () => {
      expect(listClassMeetings()).toEqual([]);
    });

    it('returns all meetings when called with no filter', () => {
      const c2 = createCourse({ name: 'Bio', abbreviation: 'BIO', color: '#0f0' });
      createClassMeeting({ courseId,       dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      createClassMeeting({ courseId: c2.id, dayOfWeek: 3, startTime: '14:00', endTime: '15:00' });
      expect(listClassMeetings()).toHaveLength(2);
    });

    it('filters by courseId', () => {
      const c2 = createCourse({ name: 'Bio', abbreviation: 'BIO', color: '#0f0' });
      createClassMeeting({ courseId,       dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      createClassMeeting({ courseId: c2.id, dayOfWeek: 2, startTime: '09:00', endTime: '10:00' });
      expect(listClassMeetings({ courseId })).toHaveLength(1);
      expect(listClassMeetings({ courseId })[0].course_id).toBe(courseId);
    });

    it('orders courseId-filtered results by day_of_week then start_time', () => {
      createClassMeeting({ courseId, dayOfWeek: 3, startTime: '14:00', endTime: '15:00' });
      createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      const list = listClassMeetings({ courseId });
      expect(list[0].day_of_week).toBe(1);
      expect(list[1].day_of_week).toBe(3);
    });

    it('returns empty when courseId filter matches nothing', () => {
      createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      expect(listClassMeetings({ courseId: 'other' })).toEqual([]);
    });
  });

  // ── createClassMeeting ──────────────────────────────────────────────────────

  describe('createClassMeeting', () => {
    it('creates with required fields and null location', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 2, startTime: '10:00', endTime: '11:30' });
      expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(m.course_id).toBe(courseId);
      expect(m.day_of_week).toBe(2);
      expect(m.start_time).toBe('10:00');
      expect(m.end_time).toBe('11:30');
      expect(m.location).toBeNull();
    });

    it('stores an optional location', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00', location: 'Room 101' });
      expect(m.location).toBe('Room 101');
    });
  });

  // ── updateClassMeeting ──────────────────────────────────────────────────────

  describe('updateClassMeeting', () => {
    it('updates dayOfWeek', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      expect(updateClassMeeting(m.id, { dayOfWeek: 5 }).day_of_week).toBe(5);
    });

    it('updates startTime', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      expect(updateClassMeeting(m.id, { startTime: '10:30' }).start_time).toBe('10:30');
    });

    it('updates endTime', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      expect(updateClassMeeting(m.id, { endTime: '11:15' }).end_time).toBe('11:15');
    });

    it('updates location to a string value', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      expect(updateClassMeeting(m.id, { location: 'Lab 3' }).location).toBe('Lab 3');
    });

    it('nulls out location when the key is present with null', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00', location: 'Lab 3' });
      expect(updateClassMeeting(m.id, { location: null }).location).toBeNull();
    });

    it('does NOT update location when the key is absent', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00', location: 'Lab 3' });
      // {} has no 'location' key — the `'location' in input` guard should skip it
      expect(updateClassMeeting(m.id, {}).location).toBe('Lab 3');
    });

    it('returns the unchanged meeting when input is empty', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 2, startTime: '10:00', endTime: '11:00' });
      const u = updateClassMeeting(m.id, {});
      expect(u.day_of_week).toBe(2);
      expect(u.start_time).toBe('10:00');
    });

    it('updates all fields at once', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      const u = updateClassMeeting(m.id, { dayOfWeek: 4, startTime: '13:00', endTime: '14:30', location: 'New Room' });
      expect(u.day_of_week).toBe(4);
      expect(u.start_time).toBe('13:00');
      expect(u.end_time).toBe('14:30');
      expect(u.location).toBe('New Room');
    });
  });

  // ── deleteClassMeeting ──────────────────────────────────────────────────────

  describe('deleteClassMeeting', () => {
    it('removes the meeting', () => {
      const m = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      deleteClassMeeting(m.id);
      expect(listClassMeetings({ courseId })).toHaveLength(0);
    });

    it('does not affect other meetings', () => {
      const m1 = createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      const m2 = createClassMeeting({ courseId, dayOfWeek: 3, startTime: '14:00', endTime: '15:00' });
      deleteClassMeeting(m2.id);
      expect(listClassMeetings({ courseId })).toHaveLength(1);
      expect(listClassMeetings({ courseId })[0].id).toBe(m1.id);
    });

    it('is a no-op for a nonexistent id', () => {
      expect(() => deleteClassMeeting('nope')).not.toThrow();
    });
  });

  // ── schema cascade ──────────────────────────────────────────────────────────

  describe('ON DELETE CASCADE', () => {
    it('removes meetings when their parent course is deleted', () => {
      createClassMeeting({ courseId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      mockDb.current!.exec(`DELETE FROM courses WHERE id = '${courseId}'`);
      expect(listClassMeetings({ courseId })).toHaveLength(0);
    });
  });
});
