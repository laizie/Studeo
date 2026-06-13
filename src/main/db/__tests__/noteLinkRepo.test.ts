import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import {
  listLinksForNote,
  listNotesForEntity,
  createNoteLink,
  deleteNoteLink,
  deleteLinksForEntity,
  entityExists,
} from '../repositories/noteLinkRepo';
import { createNote, deleteNote } from '../repositories/noteRepo';
import { createCourse } from '../repositories/courseRepo';

beforeEach(() => {
  mockDb.current = createTestDb();
});

function aCourse() {
  return createCourse({ name: 'Biology', abbreviation: 'BIO', color: '#32b562' });
}

describe('noteLinkRepo', () => {
  describe('entityExists', () => {
    it('reflects whether the target row is present', () => {
      const course = aCourse();
      expect(entityExists('course', course.id)).toBe(true);
      expect(entityExists('course', 'missing')).toBe(false);
    });
  });

  describe('createNoteLink', () => {
    it('links a note to an entity', () => {
      const note = createNote({ title: 'Cell notes' });
      const course = aCourse();
      const link = createNoteLink({ noteId: note.id, entityType: 'course', entityId: course.id });
      expect(link.note_id).toBe(note.id);
      expect(link.entity_type).toBe('course');
      expect(link.occurrence_date).toBeNull();
    });

    it('is idempotent — linking the same note+entity twice returns the existing link', () => {
      const note = createNote({});
      const course = aCourse();
      const a = createNoteLink({ noteId: note.id, entityType: 'course', entityId: course.id });
      const b = createNoteLink({ noteId: note.id, entityType: 'course', entityId: course.id });
      expect(b.id).toBe(a.id);
      expect(listLinksForNote(note.id)).toHaveLength(1);
    });

    it('treats different lecture occurrences as distinct links', () => {
      const note = createNote({});
      const course = aCourse();
      // (entity_id reused here is just a stand-in meeting id for the dedup-by-date check.)
      createNoteLink({ noteId: note.id, entityType: 'class_meeting', entityId: course.id, occurrenceDate: '2026-01-12' });
      createNoteLink({ noteId: note.id, entityType: 'class_meeting', entityId: course.id, occurrenceDate: '2026-01-19' });
      expect(listLinksForNote(note.id)).toHaveLength(2);
    });
  });

  describe('listNotesForEntity', () => {
    it('returns the notes linked to an entity, excluding archived ones', () => {
      const course = aCourse();
      const kept = createNote({ title: 'Kept' });
      const archived = createNote({ title: 'Archived' });
      createNoteLink({ noteId: kept.id, entityType: 'course', entityId: course.id });
      createNoteLink({ noteId: archived.id, entityType: 'course', entityId: course.id });
      deleteNote(archived.id); // hard delete here just to ensure it drops out
      const notes = listNotesForEntity('course', course.id);
      expect(notes.map((n) => n.id)).toEqual([kept.id]);
    });
  });

  describe('deleteNoteLink', () => {
    it('removes a single link without touching the note', () => {
      const note = createNote({});
      const course = aCourse();
      const link = createNoteLink({ noteId: note.id, entityType: 'course', entityId: course.id });
      deleteNoteLink(link.id);
      expect(listLinksForNote(note.id)).toHaveLength(0);
    });
  });

  describe('cascade + cleanup', () => {
    it('deleting a note removes its links (FK cascade)', () => {
      const note = createNote({});
      const course = aCourse();
      createNoteLink({ noteId: note.id, entityType: 'course', entityId: course.id });
      deleteNote(note.id);
      expect(listNotesForEntity('course', course.id)).toHaveLength(0);
    });

    it('deleteLinksForEntity clears every link pointing at an entity', () => {
      const course = aCourse();
      const n1 = createNote({});
      const n2 = createNote({});
      createNoteLink({ noteId: n1.id, entityType: 'course', entityId: course.id });
      createNoteLink({ noteId: n2.id, entityType: 'course', entityId: course.id });
      deleteLinksForEntity('course', course.id);
      expect(listNotesForEntity('course', course.id)).toHaveLength(0);
      // The notes themselves survive — only the links were removed.
      expect(listLinksForNote(n1.id)).toHaveLength(0);
    });
  });
});
