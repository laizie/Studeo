// Thin wrapper around the Spotify Web API.
// All calls live in the main process so the renderer never touches the network
// or holds tokens directly.

import { getValidAccessToken } from './spotifyAuth';
import type {
  SpotifyTrack,
  SpotifyPlaybackState,
  SpotifyPlaylist,
} from '../../shared/types';

const BASE = 'https://api.spotify.com/v1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiFetch(endpoint: string, options?: RequestInit): Promise<any> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 204) return null;
  if (res.status === 401) throw new Error('AUTH_EXPIRED');
  if (res.status === 404) return null; // no active device, etc.
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Shape converters ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTrack(item: any): SpotifyTrack {
  return {
    id:        item.id,
    name:      item.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artists:   (item.artists as any[]).map((a: any) => a.name as string),
    albumName: item.album.name,
    albumArt:  (item.album.images as { url: string }[])[0]?.url ?? null,
    durationMs: item.duration_ms,
    uri:       item.uri,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlaylist(p: any): SpotifyPlaylist {
  return {
    id:          p.id,
    name:        p.name,
    description: p.description || null,
    imageUrl:    (p.images as { url: string }[])?.[0]?.url ?? null,
    trackCount:  (p.tracks as { total: number })?.total ?? 0,
    uri:         p.uri,
  };
}

// ── API methods ──────────────────────────────────────────────────────────────

export async function getUserProfile(): Promise<{ displayName: string; email: string }> {
  const data = await apiFetch('/me');
  return {
    displayName: (data.display_name as string | null) ?? (data.id as string),
    email:       data.email as string,
  };
}

export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  const data = await apiFetch('/me/player');
  if (!data) return null;
  return {
    isPlaying:    data.is_playing as boolean,
    track:        data.item ? toTrack(data.item) : null,
    progressMs:   (data.progress_ms as number | null) ?? 0,
    volumePercent: (data.device as { volume_percent?: number } | null)?.volume_percent ?? 50,
    deviceName:   (data.device as { name?: string } | null)?.name ?? null,
  };
}

// Upcoming tracks for the "Up next" list. The Web API is the only source for this —
// AppleScript can't read the queue — so it needs an active device the Web API can see
// (Spotify Connect). Returns [] when nothing's queued or no visible device.
export async function getQueue(): Promise<SpotifyTrack[]> {
  const data = await apiFetch('/me/player/queue');
  if (!data?.queue) return [];
  // The queue can include podcast episodes (no `artists`); keep only real tracks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.queue as any[]).filter(t => t && t.type === 'track').map(toTrack).slice(0, 20);
}

export async function play(contextUri?: string): Promise<void> {
  const body = contextUri ? JSON.stringify({ context_uri: contextUri }) : undefined;
  await apiFetch('/me/player/play', { method: 'PUT', body });
}

export async function pause(): Promise<void> {
  await apiFetch('/me/player/pause', { method: 'PUT' });
}

export async function skipNext(): Promise<void> {
  await apiFetch('/me/player/next', { method: 'POST' });
}

export async function skipPrevious(): Promise<void> {
  await apiFetch('/me/player/previous', { method: 'POST' });
}

export async function setVolume(percent: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  await apiFetch(`/me/player/volume?volume_percent=${clamped}`, { method: 'PUT' });
}

export async function getUserPlaylists(): Promise<SpotifyPlaylist[]> {
  const data = await apiFetch('/me/playlists?limit=50');
  if (!data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items as any[]).filter(Boolean).map(toPlaylist);
}

export async function searchPlaylists(query: string): Promise<SpotifyPlaylist[]> {
  const params = new URLSearchParams({ q: query, type: 'playlist', limit: '20' });
  const data = await apiFetch(`/search?${params.toString()}`);
  if (!data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.playlists.items as any[]).filter(Boolean).map(toPlaylist);
}
