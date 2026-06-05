// Apple Music control via AppleScript (osascript).
//
// Why AppleScript instead of MusicKit JS?
// MusicKit JS uses Apple's FairPlay DRM for streaming, which only works in
// Safari. Electron runs on Chromium, which doesn't have FairPlay. The result
// is CONTENT_UNSUPPORTED: NO DRM whenever music tries to play.
//
// AppleScript sidesteps this entirely: we send commands to the native Music.app
// which handles its own DRM. The audio comes out of Music.app, not our process.
// This also means no API keys, no subscriptions check in our code, and it works
// with local libraries too.
//
// macOS only — guarded by process.platform checks in the handlers.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs   from 'node:fs';
import * as os   from 'node:os';
import * as path from 'node:path';
import type { AppleMusicTrack, AppleMusicPlaylist } from '../../shared/types';

const execAsync = promisify(execFile);

async function osascript(script: string): Promise<string> {
  try {
    const { stdout } = await execAsync('osascript', ['-e', script]);
    return stdout.trim();
  } catch {
    return '';
  }
}

// ── Artwork cache ─────────────────────────────────────────────────────────────
// Exporting artwork on every 2-second poll would be wasteful.
// We cache the base64 data URL keyed by track identity and only re-export
// when the track actually changes.

const ARTWORK_TMP = path.join(os.tmpdir(), 'classtrack_am_artwork');
let artworkCache: { trackId: string; url: string | null } = { trackId: '', url: null };

async function fetchArtworkDataUrl(trackId: string): Promise<string | null> {
  if (trackId === artworkCache.trackId) return artworkCache.url;

  // AppleScript writes the raw artwork bytes to a temp file.
  // `raw data of artwork 1` returns the actual image bytes (JPEG or PNG).
  const result = await osascript(`
    tell application "Music"
      try
        if (count of artworks of current track) is 0 then return "none"
        set artData to raw data of artwork 1 of current track
        set f to open for access POSIX file "${ARTWORK_TMP}" with write permission
        set eof f to 0
        write artData to f
        close access f
        return "ok"
      on error
        try
          close access POSIX file "${ARTWORK_TMP}"
        end try
        return "error"
      end try
    end tell
  `);

  let url: string | null = null;
  if (result === 'ok') {
    try {
      const data = fs.readFileSync(ARTWORK_TMP);
      if (data.length > 0) {
        // Detect JPEG (FF D8) vs PNG (89 50) from magic bytes
        const mime = (data[0] === 0x89 && data[1] === 0x50) ? 'image/png' : 'image/jpeg';
        url = `data:${mime};base64,${data.toString('base64')}`;
      }
    } catch { /* file unreadable — leave url null */ }
  }

  artworkCache = { trackId, url };
  return url;
}

// ── App status ────────────────────────────────────────────────────────────────

export async function getMusicAppStatus(): Promise<{ running: boolean; authorized: boolean }> {
  if (process.platform !== 'darwin') return { running: false, authorized: false };

  const running = await osascript(
    'tell application "System Events" to return (exists process "Music") as string'
  );
  if (running !== 'true') return { running: false, authorized: false };

  // Try a harmless call to check Automation permission is granted
  const state = await osascript('tell application "Music" to return player state as string');
  return { running: true, authorized: state !== '' };
}

// ── Playback state ────────────────────────────────────────────────────────────

export async function getPlaybackState(): Promise<{
  isPlaying: boolean;
  progressMs: number;
  track: AppleMusicTrack | null;
} | null> {
  if (process.platform !== 'darwin') return null;

  const stateStr = await osascript('tell application "Music" to return player state as string');
  if (!stateStr) return null;

  const isPlaying = stateStr === 'playing';

  // Get current track + position in one script to avoid multiple round-trips
  const info = await osascript(`
    tell application "Music"
      if player state is stopped then return ""
      try
        set t to current track
        set n to name of t as string
        set ar to artist of t as string
        set al to album of t as string
        set dur to (duration of t) as integer
        set pos to (player position) as integer
        return n & "||" & ar & "||" & al & "||" & dur & "||" & pos
      on error
        return ""
      end try
    end tell
  `);

  if (!info) return { isPlaying, progressMs: 0, track: null };

  const parts = info.split('||');
  if (parts.length < 5) return { isPlaying, progressMs: 0, track: null };

  const [name, artistName, albumName, durSecs, posSecs] = parts;
  const trackId = `${artistName}-${name}`;
  const artworkUrl = await fetchArtworkDataUrl(trackId);

  return {
    isPlaying,
    progressMs: parseInt(posSecs) * 1000,
    track: {
      id:         trackId,
      name:       name ?? '',
      artistName: artistName ?? '',
      albumName:  albumName ?? '',
      artworkUrl,
      durationMs: (parseInt(durSecs) || 0) * 1000,
    },
  };
}

// ── Controls ──────────────────────────────────────────────────────────────────

export async function play(): Promise<void> {
  await osascript('tell application "Music" to play');
}

export async function pause(): Promise<void> {
  await osascript('tell application "Music" to pause');
}

export async function next(): Promise<void> {
  await osascript('tell application "Music" to next track');
}

export async function previous(): Promise<void> {
  await osascript('tell application "Music" to previous track');
}

// ── Playlists ─────────────────────────────────────────────────────────────────

// Reads a temp artwork file written by AppleScript and returns a data URL.
function readArtworkFile(filePath: string): string | null {
  try {
    const data = fs.readFileSync(filePath);
    if (!data.length) return null;
    const mime = (data[0] === 0x89 && data[1] === 0x50) ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function getUserPlaylists(): Promise<AppleMusicPlaylist[]> {
  if (process.platform !== 'darwin') return [];

  const tmpDir = os.tmpdir();

  // Single AppleScript call: list all playlists and write artwork files for those
  // that have one. Marking "art" vs "none" so Node knows which files to read.
  const result = await osascript(`
    tell application "Music"
      set output to ""
      repeat with p in (every user playlist)
        try
          if class of p is not folder playlist then
            set pId   to id of p as string
            set pName to name of p as string
            set pCount to (count of tracks of p) as string
            set hasArt to "none"
            try
              -- Try playlist's own artwork first, fall back to first track's artwork
              set artData to missing value
              try
                set artData to raw data of artwork 1 of p
              on error
                if (count of tracks of p) > 0 then
                  set artData to raw data of artwork 1 of track 1 of p
                end if
              end try
              if artData is not missing value then
                set tmpPath to "${tmpDir}/classtrack_pl_" & pId
                set f to open for access POSIX file tmpPath with write permission
                set eof f to 0
                write artData to f
                close access f
                set hasArt to "art"
              end if
            on error
              -- no artwork available
            end try
            set output to output & pId & "||" & pName & "||" & pCount & "||" & hasArt & "\\n"
          end if
        end try
      end repeat
      return output
    end tell
  `);

  if (!result) return [];

  return result
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [id, name, trackCount, hasArt] = line.split('||');
      const artworkUrl = hasArt === 'art'
        ? readArtworkFile(path.join(tmpDir, `classtrack_pl_${id}`))
        : null;
      return {
        id:          id   ?? '',
        name:        name ?? 'Untitled',
        description: null,
        artworkUrl,
        trackCount:  parseInt(trackCount ?? '0') || 0,
        isLibrary:   true,
      };
    });
}

export async function playPlaylist(id: string): Promise<void> {
  // AppleScript playlist IDs are integers
  await osascript(
    `tell application "Music" to play (first user playlist whose id is ${parseInt(id)})`
  );
}
