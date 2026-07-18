// The "Now Playing" mode: a compact card that follows whichever connected service is
// actually playing — Apple Music or Spotify — without the user picking one. It can also
// be pinned to a specific service (Focus Mode uses this to render the same polished card
// for the Spotify/Apple modes' now-playing header).
//
// Both services' hooks are read unconditionally (hooks can't be conditional); each query
// is self-gated by its own connection status, so the idle one doesn't poll. We choose a
// service, normalize its playback into a NowPlayingView, and hand it to NowPlayingCard.

import { Music } from 'lucide-react';
import type { MusicService } from '../../store/useSettingsStore';
import {
  useAppleMusicStatus, useAppleMusicPlayback,
  useAppleMusicPlay, useAppleMusicPause, useAppleMusicNext, useAppleMusicPrevious,
} from '../../lib/queries/useAppleMusic';
import {
  useSpotifyStatus, useSpotifyPlayback,
  useSpotifyPlay, useSpotifyPause, useSpotifyNext, useSpotifyPrevious,
} from '../../lib/queries/useSpotify';
import NowPlayingCard, { type NowPlayingView, type NowPlayingTone } from './NowPlayingCard';

const SPOTIFY_ACCENT = '#1DB954';
const APPLE_ACCENT   = '#fc3c44';

interface Props {
  /** Pin to one service; omit to auto-follow whichever is playing. */
  service?: MusicService;
  /** 'dark' for the sidebar / Focus room (default), 'surface' for a theme surface. */
  tone?: NowPlayingTone;
}

export default function AutoNowPlaying({ service, tone = 'dark' }: Props = {}) {
  // Spotify
  const { data: spotifyStatus }   = useSpotifyStatus();
  const { data: spotifyPlayback } = useSpotifyPlayback();
  const spPlay = useSpotifyPlay();
  const spPause = useSpotifyPause();
  const spNext = useSpotifyNext();
  const spPrev = useSpotifyPrevious();

  // Apple Music
  const { data: appleStatus }   = useAppleMusicStatus();
  const { data: applePlayback } = useAppleMusicPlayback();
  const amPlay = useAppleMusicPlay();
  const amPause = useAppleMusicPause();
  const amNext = useAppleMusicNext();
  const amPrev = useAppleMusicPrevious();

  const spotifyOn = spotifyStatus?.connected === true;
  const appleOn   = appleStatus?.running === true;

  // Which service does the card show?
  //  1. pinned by prop, else
  //  2. whichever is actually playing (Apple wins a tie — it's the OS-native one), else
  //  3. whichever is merely available.
  const chosen: MusicService | null =
    service === 'spotify'      ? 'spotify'
    : service === 'apple_music' ? 'apple_music'
    : appleOn   && applePlayback?.isPlaying   ? 'apple_music'
    : spotifyOn && spotifyPlayback?.isPlaying ? 'spotify'
    : appleOn   ? 'apple_music'
    : spotifyOn ? 'spotify'
    : null;

  if (!chosen) {
    const hint =
      service === 'spotify'      ? 'Connect Spotify in Settings'
      : service === 'apple_music' ? 'Open the Music app to connect'
      : 'Play something in Apple Music or Spotify';
    const chip = tone === 'surface' ? 'bg-inset' : 'bg-white/10';
    const text = tone === 'surface' ? 'text-muted' : 'text-sidebar-muted';
    return (
      <div className="flex items-center gap-2 px-4 py-4">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${chip}`}>
          <Music size={12} className={text} />
        </div>
        <span className={`text-xs ${text}`}>{hint}</span>
      </div>
    );
  }

  // When pinned to a service, name it; in auto mode, keep the neutral "Now Playing".
  const view: NowPlayingView = chosen === 'spotify'
    ? {
        serviceLabel: service ? 'Spotify' : 'Now Playing',
        accent: SPOTIFY_ACCENT,
        tone,
        title:      spotifyPlayback?.track?.name ?? null,
        artist:     spotifyPlayback?.track?.artists.join(', ') ?? null,
        artworkUrl: spotifyPlayback?.track?.albumArt ?? null,
        isPlaying:  spotifyPlayback?.isPlaying ?? false,
        progressMs: spotifyPlayback?.progressMs ?? 0,
        durationMs: spotifyPlayback?.track?.durationMs ?? 0,
        busy: spPlay.isPending || spPause.isPending,
        onPlayPause: () => (spotifyPlayback?.isPlaying ? spPause.mutate() : spPlay.mutate(undefined)),
        onNext: () => spNext.mutate(),
        onPrev: () => spPrev.mutate(),
      }
    : {
        serviceLabel: service ? 'Apple Music' : 'Now Playing',
        accent: APPLE_ACCENT,
        tone,
        title:      applePlayback?.track?.name ?? null,
        artist:     applePlayback?.track?.artistName ?? null,
        artworkUrl: applePlayback?.track?.artworkUrl ?? null,
        isPlaying:  applePlayback?.isPlaying ?? false,
        progressMs: applePlayback?.progressMs ?? 0,
        durationMs: applePlayback?.track?.durationMs ?? 0,
        busy: amPlay.isPending || amPause.isPending,
        onPlayPause: () => (applePlayback?.isPlaying ? amPause.mutate() : amPlay.mutate()),
        onNext: () => amNext.mutate(),
        onPrev: () => amPrev.mutate(),
      };

  return <NowPlayingCard {...view} />;
}
