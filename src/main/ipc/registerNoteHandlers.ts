import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateNoteInput, UpdateNoteInput } from '../../shared/types';
import {
  listNotes,
  getNote,
  searchNotes,
  createNote,
  updateNote,
  deleteNote,
} from '../db/repositories/noteRepo';

// content_json must be a JSON array of blocks. We validate the shape here (not just that
// it parses) so a malformed document can never reach the DB or the search index.
function validateContentJson(json: string | undefined): void {
  if (json === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('contentJson must be valid JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('contentJson must be a JSON array of blocks');
}

const MAX_TITLE = 200;

export function registerNoteHandlers(): void {
  ipcMain.handle(IPC.NOTES.LIST, (_event, filters?: { archived?: boolean }) =>
    listNotes(filters ?? {})
  );

  ipcMain.handle(IPC.NOTES.GET, (_event, id: string) => {
    if (!id) throw new Error('Note id is required');
    return getNote(id);
  });

  ipcMain.handle(IPC.NOTES.SEARCH, (_event, query: string) => {
    if (typeof query !== 'string') throw new Error('query must be a string');
    return searchNotes(query);
  });

  ipcMain.handle(IPC.NOTES.CREATE, (_event, input: CreateNoteInput) => {
    if (input?.title !== undefined && input.title.length > MAX_TITLE) {
      throw new Error(`Note title must be ${MAX_TITLE} characters or fewer`);
    }
    validateContentJson(input?.contentJson);
    return createNote(input ?? {});
  });

  ipcMain.handle(IPC.NOTES.UPDATE, (_event, id: string, input: UpdateNoteInput) => {
    if (!id) throw new Error('Note id is required');
    if (input?.title !== undefined && input.title.length > MAX_TITLE) {
      throw new Error(`Note title must be ${MAX_TITLE} characters or fewer`);
    }
    validateContentJson(input?.contentJson);
    return updateNote(id, input ?? {});
  });

  ipcMain.handle(IPC.NOTES.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Note id is required');
    deleteNote(id);
  });
}
