// React Query hooks for Apple Music via AppleScript IPC.
// Same pattern as useSpotify.ts — poll the main process for state rather than
// managing it client-side.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const AM_KEYS = {
  status:   ['apple_music', 'status']   as const,
  playback: ['apple_music', 'playback'] as const,
  playlists: ['apple_music', 'playlists'] as const,
};

export function useAppleMusicStatus() {
  return useQuery({
    queryKey: AM_KEYS.status,
    queryFn:  () => window.api.appleMusic.status(),
    refetchInterval: 5_000,
  });
}

export function useAppleMusicPlayback() {
  const { data: status } = useAppleMusicStatus();
  return useQuery({
    queryKey: AM_KEYS.playback,
    queryFn:  () => window.api.appleMusic.playback(),
    enabled:  status?.running === true,
    refetchInterval: 2_000,
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
