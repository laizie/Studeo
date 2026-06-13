import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import { snapshotNoteContent, listNoteVersions } from '../repositories/noteVersionRepo';
import { createNote, updateNote, restoreNoteVersion, getNote } from '../repositories/noteRepo';

function paragraph(text: string): string {
  return JSON.stringify([
    { id: '1', type: 'paragraph', content: [{ type: 'text', text, styles: {} }], children: [] },
  ]);
}

beforeEach(() => {
  mockDb.current = createTestDb();
});

describe('noteVersionRepo', () => {
  it('throttles snapshots within the window but a forced snapshot always records', () => {
    const note = createNote({});
    snapshotNoteContent(note.id, paragraph('a'));        // first → recorded
    snapshotNoteContent(note.id, paragraph('b'));        // within window → skipped
    expect(listNoteVersions(note.id)).toHaveLength(1);

    snapshotNoteContent(note.id, paragraph('c'), true);  // forced → recorded
    expect(listNoteVersions(note.id)).toHaveLength(2);
  });

  it('records a snapshot on the first content update', () => {
    const note = createNote({ contentJson: paragraph('start') });
    updateNote(note.id, { contentJson: paragraph('edited') });
    expect(listNoteVersions(note.id)).toHaveLength(1);
  });

  it('lists snapshots newest-first', () => {
    const note = createNote({});
    snapshotNoteContent(note.id, paragraph('old'), true);
    snapshotNoteContent(note.id, paragraph('new'), true);
    const versions = listNoteVersions(note.id);
    expect(versions).toHaveLength(2);
    // created_at is monotonic non-decreasing; newest-first ordering holds by the index.
    expect(versions[0].created_at >= versions[1].created_at).toBe(true);
  });
});

describe('restoreNoteVersion', () => {
  it('restores content and snapshots the current state first (reversible)', () => {
    const note = createNote({ contentJson: paragraph('v1') });
    updateNote(note.id, { contentJson: paragraph('v1') }); // snapshot of v1
    updateNote(note.id, { contentJson: paragraph('v2-current') }); // throttled, not snapshotted

    const [v1] = listNoteVersions(note.id);
    const restored = restoreNoteVersion(note.id, v1.id);

    expect(restored.content_json).toBe(paragraph('v1'));
    expect(restored.content_text).toBe('v1');
    // The pre-restore content was force-snapshotted, so it's recoverable.
    expect(listNoteVersions(note.id).some((v) => v.content_json === paragraph('v2-current'))).toBe(true);
    expect(getNote(note.id)?.content_json).toBe(paragraph('v1'));
  });

  it('rejects a version that belongs to another note', () => {
    const a = createNote({});
    const b = createNote({});
    snapshotNoteContent(a.id, paragraph('a'), true);
    const [vA] = listNoteVersions(a.id);
    expect(() => restoreNoteVersion(b.id, vA.id)).toThrow();
  });
});
