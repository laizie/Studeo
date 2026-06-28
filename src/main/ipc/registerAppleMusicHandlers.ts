import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import {
  getMusicAppStatus, getPlaybackState,
  play, pause, next, previous,
  getUserPlaylists, playPlaylist,
  searchLibrary, playTrack,
} from '../applemusic';

export function registerAppleMusicHandlers(): void {

  ipcMain.handle(IPC.APPLE_MUSIC.STATUS, () => getMusicAppStatus());

  ipcMain.handle(IPC.APPLE_MUSIC.PLAYBACK, async () => {
    try { return await getPlaybackState(); }
    catch { return null; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.PLAY, async () => {
    try { await play(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.PAUSE, async () => {
    try { await pause(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.NEXT, async () => {
    try { await next(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.PREVIOUS, async () => {
    try { await previous(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.PLAYLISTS, async () => {
    try { return await getUserPlaylists(); }
    catch { return []; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.PLAY_PLAYLIST, async (_e, id: string) => {
    try { await playPlaylist(id); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.SEARCH_LIBRARY, async (_e, query: string) => {
    try { return await searchLibrary(query); }
    catch { return []; }
  });

  ipcMain.handle(IPC.APPLE_MUSIC.PLAY_TRACK, async (_e, databaseId: string) => {
    try { await playTrack(databaseId); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });
}
