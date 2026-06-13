import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { SaveMediaInput } from '../../shared/types';
import { saveMedia } from '../media';

// One narrow capability is exposed to the renderer: save image bytes for a note and get
// back a studeo-asset:// URL. Deletion is NOT exposed — asset cleanup happens internally in
// main when a note is deleted (see registerNoteHandlers), so the renderer never gets the
// power to remove files by path.
export function registerMediaHandlers(): void {
  ipcMain.handle(IPC.MEDIA.SAVE, (_event, input: SaveMediaInput) => {
    if (!input?.noteId) throw new Error('noteId is required');
    if (!input?.ext) throw new Error('ext is required');
    if (!(input.data instanceof Uint8Array)) throw new Error('data must be bytes');
    if (input.data.byteLength === 0) throw new Error('Empty file');
    // 25 MB ceiling — a note image, not a video.
    if (input.data.byteLength > 25 * 1024 * 1024) throw new Error('Image too large (max 25 MB)');
    return saveMedia(input.noteId, input.ext, input.data);
  });
}
