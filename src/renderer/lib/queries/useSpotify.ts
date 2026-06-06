// React Query hooks for the Spotify integration.
//
// Concept — why polling instead of push?
// The Spotify Web API doesn't offer WebSockets or server-sent events for
// playback state. The standard approach is to poll /me/player on an interval
// (~2–3 s) to keep the UI in sync with whatever the user does in Spotify itself.
// React Query's `refetchInterval` option does exactly this automatically, and
// it only polls while the tab/window is focused.

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Query keys ────────────────────────────────────────────────────────────────
// Centralised so every hook invalidates the same shape.

export const SPOTIFY_KEYS = {
  status:    ['spotify', 'status']    as const,
  playback:  ['spotify', 'playback']  as const,
  playlists: ['spotify', 'playlists'] as const,
  search:    (q: string) => ['spotify', 'search', q] as const,
};

// ── Connection status ─────────────────────────────────────────────────────────

export function useSpotifyStatus() {
  return useQuery({
    queryKey: SPOTIFY_KEYS.status,
    queryFn:  () => window.api.spotify.status(),
    // Poll while not connected so we pick up the token right after OAuth
    refetchInterval: (query) =>
      query.state.data && 'connected' in query.state.data && query.state.data.connected
        ? 30_000   // connected — refresh every 30 s (session check)
        : 3_000,   // waiting for auth — check every 3 s
  });
}

// ── Playback state ────────────────────────────────────────────────────────────

export function useSpotifyPlayback() {
  const { data: status } = useSpotifyStatus();
  return useQuery({
    queryKey: SPOTIFY_KEYS.playback,
    queryFn:  () => window.api.spotify.playback(),
    enabled:  status?.connected === true,
    refetchInterval: 2_000,  // 2 s gives near-real-time progress
  });
}

// ── Auth callback listener ────────────────────────────────────────────────────
// Call this hook once at the app root level. When main sends the auth-callback
// event (after the OS routes studeo://spotify-callback back), we immediately
// invalidate the status query so the UI reflects the new connection.

export function useSpotifyAuthListener() {
  const qc = useQueryClient();
  useEffect(() => {
    const unsub = window.api.spotify.onAuthCallback((success) => {
      if (success) qc.invalidateQueries({ queryKey: ['spotify'] });
    });
    return unsub;
  }, [qc]);
}

// ── User playlists ────────────────────────────────────────────────────────────

export function useSpotifyUserPlaylists() {
  const { data: status } = useSpotifyStatus();
  return useQuery({
    queryKey: SPOTIFY_KEYS.playlists,
    queryFn:  () => window.api.spotify.userPlaylists(),
    enabled:  status?.connected === true,
    staleTime: 60_000,  // playlists don't change every second
  });
}

// ── Playlist search ────────────────────────────────────────────────────────────

export function useSpotifySearch(query: string) {
  const { data: status } = useSpotifyStatus();
  return useQuery({
    queryKey: SPOTIFY_KEYS.search(query),
    queryFn:  () => window.api.spotify.searchPlaylists(query),
    enabled:  status?.connected === true && query.trim().length > 1,
    staleTime: 30_000,
  });
}

// ── Playback mutations ────────────────────────────────────────────────────────

export function useSpotifyPlay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contextUri?: string) => window.api.spotify.play(contextUri),
    onSuccess: () => qc.invalidateQueries({ queryKey: SPOTIFY_KEYS.playback }),
  });
}

export function useSpotifyPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.spotify.pause(),
    onSuccess: () => qc.invalidateQueries({ queryKey: SPOTIFY_KEYS.playback }),
  });
}

export function useSpotifyNext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.spotify.next(),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: SPOTIFY_KEYS.playback }), 500
    ),
  });
}

export function useSpotifyPrevious() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.spotify.previous(),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: SPOTIFY_KEYS.playback }), 500
    ),
  });
}

export function useSpotifyDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.spotify.disconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spotify'] }),
  });
}
