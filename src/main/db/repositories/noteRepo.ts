import { getDb } from '../connection';
import { blocksToPlainText } from '../../../shared/notes';
import type { Note, CreateNoteInput, UpdateNoteInput } from '../../../shared/types';

function row(r: unknown): Note {
  return r as Note;
}

export interface NoteFilters {
  archived?: boolean;
}

export function listNotes(filters: NoteFilters = {}): Note[] {
  // Default view hides archived (trashed) notes; { archived: true } shows only those.
  const sql = filters.archived
    ? 'SELECT * FROM notes WHERE archived_at IS NOT NULL ORDER BY updated_at DESC'
    : 'SELECT * FROM notes WHERE archived_at IS NULL ORDER BY updated_at DESC';
  return (getDb().prepare(sql).all() as unknown[]).map(row);
}

export function getNote(id: string): Note | null {
  const r = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
  return r ? row(r) : null;
}

// FTS5's MATCH grammar would choke on raw user input (bare punctuation, unbalanced
// quotes). We turn the query into a safe prefix search: each whitespace-separated token
// becomes a quoted phrase with a trailing '*', so "graph the" matches "graph theory".
function toFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => '"' + t.replace(/"/g, '""') + '"*')
    .join(' ');
}

export function searchNotes(query: string): Note[] {
  const match = toFtsQuery(query);
  if (!match) return [];
  return (
    getDb()
      .prepare(
        `SELECT n.* FROM notes n
         JOIN notes_fts ON notes_fts.rowid = n.rowid
         WHERE notes_fts MATCH ? AND n.archived_at IS NULL
         ORDER BY rank`
      )
      .all(match) as unknown[]
  ).map(row);
}

export function createNote(input: CreateNoteInput): Note {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const contentJson = input.contentJson ?? '[]';
  // content_text is derived, never trusted from the caller — recompute it here so search
  // can never drift from the actual document.
  const contentText = blocksToPlainText(contentJson);

  getDb()
    .prepare(
      `INSERT INTO notes (id, title, content_json, content_text, icon, parent_note_id, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      input.title?.trim() || 'Untitled',
      contentJson,
      contentText,
      input.icon ?? null,
      input.parentNoteId ?? null,
      now,
      now,
    );
  return getNote(id)!;
}

export function updateNote(id: string, input: UpdateNoteInput): Note {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title.trim() || 'Untitled');
  }
  if (input.contentJson !== undefined) {
    fields.push('content_json = ?');
    values.push(input.contentJson);
    // Keep the derived plaintext in lock-step with the document on every content change.
    fields.push('content_text = ?');
    values.push(blocksToPlainText(input.contentJson));
  }
  if (input.icon !== undefined) {
    fields.push('icon = ?');
    values.push(input.icon ?? null);
  }
  if (input.parentNoteId !== undefined) {
    fields.push('parent_note_id = ?');
    values.push(input.parentNoteId ?? null);
  }
  if (input.archived !== undefined) {
    fields.push('archived_at = ?');
    values.push(input.archived ? new Date().toISOString() : null);
  }

  if (fields.length > 0) {
    // Any edit bumps updated_at — that's what the note list sorts by.
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    getDb().prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getNote(id)!;
}

// A note plus every sub-page beneath it (recursive). Used before delete so the caller can
// clean up each note's image folder — the DB cascade removes the rows, but not the files.
export function listNoteAndDescendantIds(id: string): string[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM notes WHERE id = ?
         UNION ALL
         SELECT n.id FROM notes n JOIN descendants d ON n.parent_note_id = d.id
       )
       SELECT id FROM descendants`
    )
    .all(id) as { id: string }[];
  return rows.map((r) => r.id);
}

export function deleteNote(id: string): void {
  // ON DELETE CASCADE removes child sub-pages; the FTS triggers clean the index.
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
}
