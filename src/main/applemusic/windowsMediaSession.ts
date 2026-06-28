// Windows "now playing" for Apple Music via the System Media Transport Controls (SMTC).
//
// Why this exists, and why it's split two ways:
// The macOS integration (appleMusicScript.ts) drives Music.app through AppleScript,
// which doesn't exist on Windows. Windows instead exposes a single OS-level "now
// playing" surface — the same media info you see in the volume flyout and on the lock
// screen — that any media app feeds, including the Apple Music app. We touch it two
// different ways, on purpose:
//
//   • READ (polled ~every 2s): the prebuilt native module @coooookies/windows-smtc-monitor.
//     Reading happens constantly, so it must be in-process and fast — spawning a
//     subprocess on every poll would be wasteful.
//   • CONTROL (play/pause/skip — user-initiated and rare): a short PowerShell script
//     that calls the same SMTC session's TryPlay/TryPause/TrySkip* methods. The clean
//     native module is read-only, and a few hundred ms of latency on a button press is
//     fine here (unlike polling).
//
// SMTC can't browse playlists or search a library, so on Windows Apple Music is
// now-playing-only — the facade reports canBrowseLibrary:false and the UI collapses
// to the now-playing card to match.
//
// Windows only — never imported/invoked elsewhere (the facade in ./index.ts guards by
// process.platform). The native addon is loaded lazily so that merely importing this
// file on macOS/Linux (where the .node binary isn't installed) is harmless.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import type { AppleMusicTrack, AppleMusicPlaylist } from '../../shared/types';

const execAsync = promisify(execFile);

// SMTC PlaybackStatus enum: CLOSED=0, OPENED=1, CHANGING=2, STOPPED=3, PLAYING=4, PAUSED=5.
const SMTC_PLAYING = 4;

// Apple Music's SMTC source-app id (an AUMID) looks like "AppleInc.AppleMusicWin_…!App";
// legacy iTunes appears as "iTunes.exe". Match either, case-insensitively.
const APPLE_SOURCE_RE = /applemusic|itunes/i;

// ── Native module (lazy, Windows-only) ─────────────────────────────────────────
// undefined = not tried yet, null = unavailable (wrong OS / too-old Windows / load error).
let cachedModule: typeof import('@coooookies/windows-smtc-monitor') | null | undefined;

async function loadSmtc(): Promise<typeof import('@coooookies/windows-smtc-monitor') | null> {
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = await import('@coooookies/windows-smtc-monitor');
  } catch {
    // Non-Windows, Windows < 1809, or a missing prebuilt binary — treat as "no now-playing".
    cachedModule = null;
  }
  return cachedModule;
}

// MediaInfo as returned by the native module (typed locally to avoid importing the
// package's types at module scope on platforms where it isn't installed).
type SmtcMediaInfo = {
  sourceAppId: string;
  media: { title: string; artist: string; albumTitle: string; thumbnail?: Buffer };
  playback: { playbackStatus: number };
  timeline: { position: number; duration: number };
};

async function getAppleSession(): Promise<SmtcMediaInfo | null> {
  const mod = await loadSmtc();
  if (!mod) return null;
  try {
    const sessions = mod.SMTCMonitor.getMediaSessions() as unknown as SmtcMediaInfo[];
    return sessions.find(s => APPLE_SOURCE_RE.test(s.sourceAppId)) ?? null;
  } catch {
    return null;
  }
}

// ── App status ──────────────────────────────────────────────────────────────────

export async function getMusicAppStatus(): Promise<{ running: boolean; authorized: boolean }> {
  const running = (await getAppleSession()) !== null;
  // SMTC needs no permission grant (unlike macOS Automation), so authorized tracks running.
  return { running, authorized: running };
}

// ── Playback state ────────────────────────────────────────────────────────────

// Re-encode artwork to a data URL only when the track changes — the native module
// hands back fresh thumbnail bytes on every poll, and base64-ing them every 2s is wasteful.
let artCache: { id: string; url: string | null } = { id: '', url: null };

function artworkFor(id: string, buf?: Buffer): string | null {
  if (id === artCache.id) return artCache.url;
  let url: string | null = null;
  if (buf && buf.length > 0) {
    const mime = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
    url = `data:${mime};base64,${buf.toString('base64')}`;
  }
  artCache = { id, url };
  return url;
}

export async function getPlaybackState(): Promise<{
  isPlaying: boolean;
  progressMs: number;
  track: AppleMusicTrack | null;
} | null> {
  const session = await getAppleSession();
  if (!session) return null;

  const { media, playback, timeline } = session;
  const name = media.title ?? '';
  const artistName = media.artist ?? '';
  const trackId = `${artistName}-${name}`;

  // SMTC timeline is in seconds (a TimeSpan divided by 10,000,000); we store ms.
  const toMs = (secs: number) => Math.max(0, Math.round((secs ?? 0) * 1000));

  return {
    isPlaying: playback.playbackStatus === SMTC_PLAYING,
    progressMs: toMs(timeline.position),
    track: {
      id:         trackId,
      name,
      artistName,
      albumName:  media.albumTitle ?? '',
      artworkUrl: artworkFor(trackId, media.thumbnail),
      durationMs: toMs(timeline.duration),
    },
  };
}

// ── Controls (PowerShell → SMTC) ──────────────────────────────────────────────
// Use the in-box Windows PowerShell 5.1 (full path — packaged apps don't inherit a
// useful PATH, and PS 5.1's WinRT projection is the one this snippet relies on).

const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
);

// The action is read from an env var (SMTC_ACTION) rather than interpolated into the
// script, so there's no string-injection surface. `IAsyncOperation`1` carries a literal
// backtick (escaped for this JS template literal); inside PowerShell single quotes it
// stays literal, which is what reflection's generic type name needs.
const CONTROL_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  function Await($op, $t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(-1); $task.Result }
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $session = $null
  foreach ($s in $mgr.GetSessions()) { if ($s.SourceAppUserModelId -match 'applemusic|itunes') { $session = $s; break } }
  if ($null -eq $session) { $session = $mgr.GetCurrentSession() }
  if ($null -eq $session) { exit 1 }
  switch ($env:SMTC_ACTION) {
    'play'     { [void](Await ($session.TryPlayAsync())         ([bool])) }
    'pause'    { [void](Await ($session.TryPauseAsync())        ([bool])) }
    'next'     { [void](Await ($session.TrySkipNextAsync())     ([bool])) }
    'previous' { [void](Await ($session.TrySkipPreviousAsync()) ([bool])) }
  }
} catch { exit 1 }
`;

async function control(action: 'play' | 'pause' | 'next' | 'previous'): Promise<void> {
  // -EncodedCommand (UTF-16LE base64) sidesteps all command-line quoting of the script.
  const encoded = Buffer.from(CONTROL_SCRIPT, 'utf16le').toString('base64');
  try {
    await execAsync(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { env: { ...process.env, SMTC_ACTION: action }, windowsHide: true },
    );
  } catch {
    // Best-effort: a failed control press is a no-op (the 2s poll keeps state honest).
  }
}

export const play     = (): Promise<void> => control('play');
export const pause    = (): Promise<void> => control('pause');
export const next     = (): Promise<void> => control('next');
export const previous = (): Promise<void> => control('previous');

// ── Library (unsupported on Windows/SMTC) ─────────────────────────────────────
// SMTC exposes only the current session, never the library — these are inert so the
// shared IPC surface stays uniform. The UI hides playlists/search when canBrowseLibrary is false.

export async function getUserPlaylists(): Promise<AppleMusicPlaylist[]> { return []; }
export async function playPlaylist(_id: string): Promise<void> { /* not available via SMTC */ }
export async function searchLibrary(_query: string): Promise<AppleMusicTrack[]> { return []; }
export async function playTrack(_databaseId: string): Promise<void> { /* not available via SMTC */ }
