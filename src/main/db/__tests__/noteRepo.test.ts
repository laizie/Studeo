import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import {
  listNotes,
  listLooseNotes,
  listChildNotes,
  getNote,
  searchNotes,
  createNote,
  updateNote,
  deleteNote,
  listNoteAndDescendantIds,
} from '../repositories/noteRepo';
import { createNoteLink } from '../repositories/noteLinkRepo';
import { createCourse } from '../repositories/courseRepo';

// Helper: a one-paragraph BlockNote document containing the given text.
function paragraph(text: string): string {
  return JSON.stringify([
    { id: '1', type: 'paragraph', content: [{ type: 'text', text, styles: {} }], children: [] },
  ]);
}

beforeEach(() => {
  mockDb.current = createTestDb();
});

describe('noteRepo', () => {
  describe('createNote', () => {
    it('defaults the title to "Untitled" and the document to empty', () => {
      const note = createNote({});
      expect(note.title).toBe('Untitled');
      expect(note.content_json).toBe('[]');
      expect(note.content_text).toBe('');
      expect(note.archived_at).toBeNull();
      expect(note.created_at).toBe(note.updated_at);
    });

    it('derives content_text from the document', () => {
      const note = createNote({ title: 'Lecture 1', contentJson: paragraph('photosynthesis basics') });
      expect(note.content_text).toBe('photosynthesis basics');
    });
  });

  describe('getNote', () => {
    it('returns null for a nonexistent id', () => {
      expect(getNote('nope')).toBeNull();
    });

    it('round-trips a created note', () => {
      const created = createNote({ title: 'A' });
      expect(getNote(created.id)?.title).toBe('A');
    });
  });

  describe('listNotes', () => {
    it('returns non-archived notes by default, newest-updated first', () => {
      createNote({ title: 'First' });
      const second = createNote({ title: 'Second' });
      // Touch `second` so it sorts ahead by updated_at.
      updateNote(second.id, { title: 'Second!' });
      const list = listNotes();
      expect(list.map((n) => n.title)).toEqual(['Second!', 'First']);
    });

    it('excludes archived notes by default and returns only archived when asked', () => {
      const keep = createNote({ title: 'Keep' });
      const trash = createNote({ title: 'Trash' });
      updateNote(trash.id, { archived: true });

      expect(listNotes().map((n) => n.id)).toEqual([keep.id]);
      expect(listNotes({ archived: true }).map((n) => n.id)).toEqual([trash.id]);
    });
  });

  describe('updateNote', () => {
    it('recomputes content_text when the document changes', () => {
      const note = createNote({ contentJson: paragraph('old') });
      const updated = updateNote(note.id, { contentJson: paragraph('new text') });
      expect(updated.content_text).toBe('new text');
    });

    it('archives and restores via the archived flag', () => {
      const note = createNote({});
      expect(updateNote(note.id, { archived: true }).archived_at).not.toBeNull();
      expect(updateNote(note.id, { archived: false }).archived_at).toBeNull();
    });

    it('falls back to "Untitled" when the title is blanked', () => {
      const note = createNote({ title: 'Has title' });
      expect(updateNote(note.id, { title: '   ' }).title).toBe('Untitled');
    });
  });

  describe('searchNotes', () => {
    it('returns [] for an empty query', () => {
      createNote({ contentJson: paragraph('anything') });
      expect(searchNotes('   ')).toEqual([]);
    });

    it('finds notes by content text (prefix match)', () => {
      const match = createNote({ title: 'Bio', contentJson: paragraph('mitochondria powerhouse') });
      createNote({ title: 'Chem', contentJson: paragraph('covalent bonds') });
      const results = searchNotes('mitoch');
      expect(results.map((n) => n.id)).toEqual([match.id]);
    });

    it('matches on the title too', () => {
      const match = createNote({ title: 'Thermodynamics', contentJson: paragraph('body') });
      expect(searchNotes('thermo').map((n) => n.id)).toEqual([match.id]);
    });

    it('excludes archived notes from results', () => {
      const note = createNote({ contentJson: paragraph('findme keyword') });
      updateNote(note.id, { archived: true });
      expect(searchNotes('findme')).toEqual([]);
    });
  });

  describe('note_date', () => {
    it('stores a note date on create and lets update set/clear it', () => {
      const note = createNote({ noteDate: '2026-09-02' });
      expect(note.note_date).toBe('2026-09-02');
      expect(updateNote(note.id, { noteDate: '2026-09-09' }).note_date).toBe('2026-09-09');
      expect(updateNote(note.id, { noteDate: null }).note_date).toBeNull();
    });

    it('defaults note_date to today (local) when not provided', () => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(createNote({}).note_date).toBe(today);
    });
  });

  describe('listLooseNotes', () => {
    it('returns only top-level notes with no course link', () => {
      const course = createCourse({ name: 'Bio', abbreviation: 'BIO', color: '#32b562' });
      const loose = createNote({ title: 'Loose' });
      const linked = createNote({ title: 'Linked' });
      createNoteLink({ noteId: linked.id, entityType: 'course', entityId: course.id });
      const child = createNote({ title: 'Child', parentNoteId: loose.id });

      const ids = listLooseNotes().map((n) => n.id);
      expect(ids).toContain(loose.id);
      expect(ids).not.toContain(linked.id); // has a course link
      expect(ids).not.toContain(child.id);  // a sub-page, not top-level
    });
  });

  describe('listChildNotes', () => {
    it('returns direct sub-pages of a note', () => {
      const parent = createNote({ title: 'Lab' });
      const child1 = createNote({ title: 'Lab 1', parentNoteId: parent.id });
      const child2 = createNote({ title: 'Lab 2', parentNoteId: parent.id });
      createNote({ title: 'Unrelated' });
      const ids = listChildNotes(parent.id).map((n) => n.id).sort();
      expect(ids).toEqual([child1.id, child2.id].sort());
    });
  });

  describe('listNoteAndDescendantIds', () => {
    it('returns the note plus all nested sub-pages, excluding unrelated notes', () => {
      const parent = createNote({ title: 'Parent' });
      const child = createNote({ title: 'Child', parentNoteId: parent.id });
      const grandchild = createNote({ title: 'Grandchild', parentNoteId: child.id });
      const unrelated = createNote({ title: 'Unrelated' });

      const ids = listNoteAndDescendantIds(parent.id).sort();
      expect(ids).toEqual([parent.id, child.id, grandchild.id].sort());
      expect(ids).not.toContain(unrelated.id);
    });
  });

  describe('deleteNote', () => {
    it('removes the note', () => {
      const note = createNote({});
      deleteNote(note.id);
      expect(getNote(note.id)).toBeNull();
    });

    it('cascades to child sub-pages', () => {
      const parent = createNote({ title: 'Parent' });
      const child = createNote({ title: 'Child', parentNoteId: parent.id });
      deleteNote(parent.id);
      expect(getNote(child.id)).toBeNull();
    });
  });
});
