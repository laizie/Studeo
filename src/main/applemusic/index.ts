// Platform facade for the Apple Music feature.
//
// The renderer talks to a single IPC surface (window.api.appleMusic.*). This module
// picks the right backend per OS so nothing above it has to care:
//   • macOS   → appleMusicScript.ts   (AppleScript drives Music.app — full library)
//   • Windows → windowsMediaSession.ts (SMTC — now-playing + transport only)
//   • other   → inert (the feature simply reports "not running")
//
// It also owns the one capability difference: canBrowseLibrary. macOS can list
// playlists and search the library; Windows (SMTC) cannot, so the UI collapses to the
// now-playing card there.

import type { AppleMusicTrack, AppleMusicPlaylist, AppleMusicStatus } from '../../shared/types';
import * as mac from './appleMusicScript';
import * as win from './windowsMediaSession';

interface AppleMusicBackend {
  getMusicAppStatus(): Promise<{ running: boolean; authorized: boolean }>;
  getPlaybackState(): Promise<{ isPlaying: boolean; progressMs: number; track: AppleMusicTrack | null } | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  getUserPlaylists(): Promise<AppleMusicPlaylist[]>;
  playPlaylist(id: string): Promise<void>;
  searchLibrary(query: string): Promise<AppleMusicTrack[]>;
  playTrack(databaseId: string): Promise<void>;
}

// Both modules only define functions / constants at import time (the native addon is
// loaded lazily inside windowsMediaSession), so importing both on any OS is harmless.
const impl: AppleMusicBackend | null =
  process.platform === 'darwin' ? mac
  : process.platform === 'win32' ? win
  : null;

const CAN_BROWSE_LIBRARY = process.platform === 'darwin';

export async function getMusicAppStatus(): Promise<AppleMusicStatus> {
  if (!impl) return { running: false, authorized: false, canBrowseLibrary: false };
  const base = await impl.getMusicAppStatus();
  return { ...base, canBrowseLibrary: CAN_BROWSE_LIBRARY };
}

export async function getPlaybackState() {
  return impl ? impl.getPlaybackState() : null;
}

export async function play():     Promise<void> { if (impl) await impl.play(); }
export async function pause():    Promise<void> { if (impl) await impl.pause(); }
export async function next():     Promise<void> { if (impl) await impl.next(); }
export async function previous(): Promise<void> { if (impl) await impl.previous(); }

export async function getUserPlaylists(): Promise<AppleMusicPlaylist[]> {
  return impl ? impl.getUserPlaylists() : [];
}

export async function playPlaylist(id: string): Promise<void> {
  if (impl) await impl.playPlaylist(id);
}

export async function searchLibrary(query: string): Promise<AppleMusicTrack[]> {
  return impl ? impl.searchLibrary(query) : [];
}

export async function playTrack(databaseId: string): Promise<void> {
  if (impl) await impl.playTrack(databaseId);
}
