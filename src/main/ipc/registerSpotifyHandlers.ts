import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../../shared/types';
import {
  getClientId, setClientId, initiateAuth, clearTokens, loadTokens,
} from '../spotify/spotifyAuth';
import {
  getUserProfile, getUserPlaylists, searchPlaylists,
} from '../spotify/spotifyApi';
import {
  getSpotifyPlaybackState, spotifyPlay, spotifyPause, spotifyNext, spotifyPrevious,
} from '../spotify/spotifyScript';

// Helper — send the auth-callback result to every open window.
// Used by main.ts after the OS routes the OAuth redirect URI back to us.
export function notifyAuthCallback(success: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('spotify:auth-callback', { success });
  }
}

export function registerSpotifyHandlers(): void {

  // Returns the connection status.
  // We treat having valid (non-expired) tokens as "connected" — calling /me for
  // the display name is best-effort only. Spotify Premium is required for /me on
  // some developer accounts; we don't want that to block the connected state.
  ipcMain.handle(IPC.SPOTIFY.STATUS, async () => {
    const clientIdConfigured = !!getClientId();
    const tokens = loadTokens();
    if (!tokens) return { connected: false, clientIdConfigured };
    try {
      const profile = await getUserProfile();
      return { connected: true, ...profile };
    } catch {
      // /me failed (e.g. 403 Premium required) — still connected, just no name
      return { connected: true, displayName: 'Spotify', email: '' };
    }
  });

  // Saves the client ID without triggering the OAuth flow (for pre-configuring).
  ipcMain.handle(IPC.SPOTIFY.SET_CLIENT_ID, (_e, clientId: string) => {
    setClientId(clientId);
    return { ok: true };
  });

  // Saves the client ID then opens the browser to Spotify's auth page.
  ipcMain.handle(IPC.SPOTIFY.CONNECT, (_e, clientId: string) => {
    setClientId(clientId);
    initiateAuth(clientId);
    return { ok: true };
  });

  ipcMain.handle(IPC.SPOTIFY.DISCONNECT, () => {
    clearTokens();
    return { ok: true };
  });

  // Playback state + controls use AppleScript — no Premium required
  ipcMain.handle(IPC.SPOTIFY.PLAYBACK, async () => {
    try { return await getSpotifyPlaybackState(); }
    catch { return null; }
  });

  ipcMain.handle(IPC.SPOTIFY.PLAY, async (_e, contextUri?: string) => {
    try { await spotifyPlay(contextUri); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.SPOTIFY.PAUSE, async () => {
    try { await spotifyPause(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.SPOTIFY.NEXT, async () => {
    try { await spotifyNext(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.SPOTIFY.PREVIOUS, async () => {
    try { await spotifyPrevious(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle(IPC.SPOTIFY.VOLUME, async () => {
    // Volume control via Spotify's AppleScript API is not supported
    return { ok: false, error: 'Volume control not available' };
  });

  ipcMain.handle(IPC.SPOTIFY.USER_PLAYLISTS, async () => {
    try { return await getUserPlaylists(); }
    catch { return []; }
  });

  ipcMain.handle(IPC.SPOTIFY.SEARCH_PLAYLISTS, async (_e, query: string) => {
    try { return await searchPlaylists(query); }
    catch { return []; }
  });
}
