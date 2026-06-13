import { getDb } from '../connection';
import type { Note, NoteLink, NoteLinkEntity, CreateNoteLinkInput } from '../../../shared/types';

function linkRow(r: unknown): NoteLink {
  return r as NoteLink;
}
function noteRow(r: unknown): Note {
  return r as Note;
}

// entity_type → the table its entity_id points at. The keys are the validated, fixed set
// from shared/types, so using the mapped value as a table name in SQL is safe (no injection).
const ENTITY_TABLE: Record<NoteLinkEntity, string> = {
  course: 'courses',
  assignment: 'assignments',
  class_meeting: 'class_meetings',
  study_session: 'study_sessions',
  term: 'terms',
};

/** Does the target entity actually exist? Used by the handler before creating a link. */
export function entityExists(entityType: NoteLinkEntity, entityId: string): boolean {
  const table = ENTITY_TABLE[entityType];
  const r = getDb().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(entityId);
  return !!r;
}

export function listLinksForNote(noteId: string): NoteLink[] {
  return (
    getDb()
      .prepare('SELECT * FROM note_links WHERE note_id = ? ORDER BY created_at ASC')
      .all(noteId) as unknown[]
  ).map(linkRow);
}

/**
 * The (non-archived) notes attached to one entity, newest-updated first.
 * For lectures, pass occurrenceDate to scope to a single dated lecture; omit it for
 * course/assignment/etc (whose links carry no date) to get all their notes.
 */
export function listNotesForEntity(
  entityType: NoteLinkEntity,
  entityId: string,
  occurrenceDate?: string,
): Note[] {
  const params: string[] = [entityType, entityId];
  let dateClause = '';
  if (occurrenceDate) {
    dateClause = ' AND l.occurrence_date = ?';
    params.push(occurrenceDate);
  }
  return (
    getDb()
      .prepare(
        `SELECT n.* FROM notes n
         JOIN note_links l ON l.note_id = n.id
         WHERE l.entity_type = ? AND l.entity_id = ?${dateClause} AND n.archived_at IS NULL
         ORDER BY n.updated_at DESC`
      )
      .all(...params) as unknown[]
  ).map(noteRow);
}

// Find an identical existing link so creation is idempotent. `occurrence_date IS ?` matches
// NULL when the bound value is null, so course/assignment links (no date) dedupe correctly.
function findLink(
  noteId: string,
  entityType: NoteLinkEntity,
  entityId: string,
  occurrenceDate: string | null,
): NoteLink | null {
  const r = getDb()
    .prepare(
      `SELECT * FROM note_links
       WHERE note_id = ? AND entity_type = ? AND entity_id = ? AND occurrence_date IS ?`
    )
    .get(noteId, entityType, entityId, occurrenceDate);
  return r ? linkRow(r) : null;
}

export function createNoteLink(input: CreateNoteLinkInput): NoteLink {
  const occurrenceDate = input.occurrenceDate ?? null;

  // Linking the same note to the same entity again is a no-op — return what's there.
  const existing = findLink(input.noteId, input.entityType, input.entityId, occurrenceDate);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO note_links (id, note_id, entity_type, entity_id, occurrence_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.noteId, input.entityType, input.entityId, occurrenceDate, now);

  return findLink(input.noteId, input.entityType, input.entityId, occurrenceDate)!;
}

export function deleteNoteLink(id: string): void {
  getDb().prepare('DELETE FROM note_links WHERE id = ?').run(id);
}

/** Remove all links pointing at an entity — called when that entity is deleted, since
    entity_id is polymorphic and can't be a cascading foreign key. */
export function deleteLinksForEntity(entityType: NoteLinkEntity, entityId: string): void {
  getDb()
    .prepare('DELETE FROM note_links WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId);
}
