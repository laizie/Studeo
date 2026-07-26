// React Query hooks for Apple Music via AppleScript IPC.
// Same pattern as useSpotify.ts — poll the main process for state rather than
// managing it client-side.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const AM_KEYS = {
  status:   ['apple_music', 'status']   as const,
  playback: ['apple_music', 'playback'] as const,
  playlists: ['apple_music', 'playlists'] as const,
};

// Polling here is not free the way a fetch would be: every status check spawns TWO
// `osascript` child processes and sends Apple Events to Music.app, and every playback
// check spawns one or two more. The mini-player lives in the Sidebar, so once a music
// mode is picked this runs on EVERY screen for as long as the app is open — a steady
// drip of process spawns behind someone writing notes.
//
// So the cadence follows what's actually happening rather than a fixed tick:
//   · Music.app not running  → every 30s (just watching for it to appear)
//   · running but paused     → every 10s
//   · actually playing       → every 2s, which is what a progress bar needs
// React Query already pauses `refetchInterval` while the window is unfocused, so this
// compounds with that rather than replacing it.
const STATUS_IDLE_MS    = 30_000;
const STATUS_RUNNING_MS = 10_000;
const PLAYBACK_PLAYING_MS = 2_000;
const PLAYBACK_PAUSED_MS  = 10_000;

export function useAppleMusicStatus() {
  return useQuery({
    queryKey: AM_KEYS.status,
    queryFn:  () => window.api.appleMusic.status(),
    refetchInterval: (query) =>
      query.state.data?.running ? STATUS_RUNNING_MS : STATUS_IDLE_MS,
  });
}

export function useAppleMusicPlayback() {
  const { data: status } = useAppleMusicStatus();
  return useQuery({
    queryKey: AM_KEYS.playback,
    queryFn:  () => window.api.appleMusic.playback(),
    enabled:  status?.running === true,
    // Only the moving progress bar justifies a 2s spawn; a paused track doesn't.
    refetchInterval: (query) =>
      query.state.data?.isPlaying ? PLAYBACK_PLAYING_MS : PLAYBACK_PAUSED_MS,
  });
}

export function useAppleMusicPlaylists() {
  const { data: status } = useAppleMusicStatus();
  return useQuery({
    queryKey: AM_KEYS.playlists,
    queryFn:  () => window.api.appleMusic.playlists(),
    enabled:  status?.authorized === true,
    staleTime: 60_000,
  });
}

export function useAppleMusicPlay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.appleMusic.play(),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: AM_KEYS.playback }), 300
    ),
  });
}

export function useAppleMusicPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.appleMusic.pause(),
    onSuccess: () => qc.invalidateQueries({ queryKey: AM_KEYS.playback }),
  });
}

export function useAppleMusicNext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.appleMusic.next(),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: AM_KEYS.playback }), 500
    ),
  });
}

export function useAppleMusicPrevious() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.appleMusic.previous(),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: AM_KEYS.playback }), 500
    ),
  });
}

export function useAppleMusicPlayPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.appleMusic.playPlaylist(id),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: AM_KEYS.playback }), 600
    ),
  });
}

export function useAppleMusicSearchLibrary(query: string) {
  const { data: status } = useAppleMusicStatus();
  return useQuery({
    queryKey: ['apple_music', 'search_library', query] as const,
    queryFn:  () => window.api.appleMusic.searchLibrary(query),
    enabled:  status?.authorized === true && query.trim().length > 0,
    staleTime: 30_000,
  });
}

export function useAppleMusicPlayTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (databaseId: string) => window.api.appleMusic.playTrack(databaseId),
    onSuccess: () => setTimeout(
      () => qc.invalidateQueries({ queryKey: AM_KEYS.playback }), 600
    ),
  });
}
