// AppleScript control of the Spotify desktop app.
//
// Spotify's Web API requires Premium for playback endpoints (play, pause, skip).
// On macOS, Spotify.app has a full AppleScript interface — we use it for all
// playback control so Premium is not required.
//
// Web API is still used for listing/searching playlists (read-only, no Premium
// needed). Clicking a playlist calls `open location "spotify:playlist:xxx"` here,
// which opens it in the running Spotify app.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SpotifyPlaybackState } from '../../shared/types';

const execAsync = promisify(execFile);

async function osascript(script: string): Promise<string> {
  try {
    const { stdout } = await execAsync('osascript', ['-e', script]);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function isSpotifyRunning(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  const res = await osascript(
    'tell application "System Events" to return (exists process "Spotify") as string'
  );
  return res === 'true';
}

export async function getSpotifyPlaybackState(): Promise<SpotifyPlaybackState | null> {
  if (process.platform !== 'darwin') return null;
  if (!(await isSpotifyRunning())) return null;

  const stateStr = await osascript(
    'tell application "Spotify" to return player state as string'
  );
  if (!stateStr) return null;

  const isPlaying = stateStr === 'playing';

  // Fetch track info + position in a single round-trip
  // Note: Spotify's `duration` is in milliseconds; `player position` is in seconds.
  const info = await osascript(`
    tell application "Spotify"
      try
        set t to current track
        set tName   to name of t as string
        set tArtist to artist of t as string
        set tAlbum  to album of t as string
        set tDurMs  to duration of t as integer
        set tPos    to player position as integer
        set tArt    to artwork url of t as string
        return tName & "||" & tArtist & "||" & tAlbum & "||" & tDurMs & "||" & tPos & "||" & tArt
      on error
        return ""
      end try
    end tell
  `);

  if (!info) {
    return { isPlaying, track: null, progressMs: 0, volumePercent: 50, deviceName: 'Spotify' };
  }

  const [name, artist, albumName, durMs, posSecs, albumArt] = info.split('||');
  return {
    isPlaying,
    track: {
      id:        `${artist ?? ''}-${name ?? ''}`,
      name:      name      ?? '',
      artists:   [artist   ?? ''],
      albumName: albumName ?? '',
      albumArt:  albumArt  || null,
      durationMs: parseInt(durMs ?? '0') || 0,
      uri:       '',
    },
    progressMs:    (parseInt(posSecs ?? '0') || 0) * 1000,
    volumePercent: 50,
    deviceName:    'Spotify',
  };
}

// contextUri is a spotify: URI — e.g. "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO"
// Passing one opens that context in Spotify; omitting it resumes current queue.
export async function spotifyPlay(contextUri?: string): Promise<void> {
  if (contextUri) {
    await osascript(`tell application "Spotify" to open location "${contextUri}"`);
  } else {
    await osascript('tell application "Spotify" to play');
  }
}

export async function spotifyPause():    Promise<void> { await osascript('tell application "Spotify" to pause');          }
export async function spotifyNext():     Promise<void> { await osascript('tell application "Spotify" to next track');     }
export async function spotifyPrevious(): Promise<void> { await osascript('tell application "Spotify" to previous track'); }
