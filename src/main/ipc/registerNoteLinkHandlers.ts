import { ipcMain } from 'electron';
import { IPC, NOTE_LINK_ENTITIES } from '../../shared/types';
import type { NoteLinkEntity, CreateNoteLinkInput } from '../../shared/types';
import {
  listLinksForNote,
  listNotesForEntity,
  createNoteLink,
  setLinkPinned,
  deleteNoteLink,
  entityExists,
} from '../db/repositories/noteLinkRepo';
import { getNote } from '../db/repositories/noteRepo';

function assertEntityType(type: unknown): asserts type is NoteLinkEntity {
  if (typeof type !== 'string' || !NOTE_LINK_ENTITIES.includes(type as NoteLinkEntity)) {
    throw new Error(`Invalid entity type: ${String(type)}`);
  }
}

export function registerNoteLinkHandlers(): void {
  ipcMain.handle(IPC.NOTE_LINKS.LIST_FOR_NOTE, (_event, noteId: string) => {
    if (!noteId) throw new Error('noteId is required');
    return listLinksForNote(noteId);
  });

  ipcMain.handle(IPC.NOTE_LINKS.NOTES_FOR_ENTITY, (_event, entityType: NoteLinkEntity, entityId: string, occurrenceDate?: string) => {
    assertEntityType(entityType);
    if (!entityId) throw new Error('entityId is required');
    return listNotesForEntity(entityType, entityId, occurrenceDate);
  });

  ipcMain.handle(IPC.NOTE_LINKS.CREATE, (_event, input: CreateNoteLinkInput) => {
    if (!input?.noteId) throw new Error('noteId is required');
    assertEntityType(input.entityType);
    if (!input.entityId) throw new Error('entityId is required');
    // Both ends must exist: a real note, and a real target entity. entity_id has no SQL
    // foreign key (it's polymorphic), so this check is what guarantees integrity.
    if (!getNote(input.noteId)) throw new Error('Note not found');
    if (!entityExists(input.entityType, input.entityId)) throw new Error('Linked item not found');
    // occurrence_date only makes sense for a lecture (class_meeting).
    if (input.occurrenceDate && input.entityType !== 'class_meeting') {
      throw new Error('occurrenceDate is only valid for class_meeting links');
    }
    return createNoteLink(input);
  });

  ipcMain.handle(IPC.NOTE_LINKS.SET_PINNED, (_event, linkId: string, pinned: boolean) => {
    if (!linkId) throw new Error('Link id is required');
    setLinkPinned(linkId, !!pinned);
  });

  ipcMain.handle(IPC.NOTE_LINKS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Link id is required');
    deleteNoteLink(id);
  });
}
