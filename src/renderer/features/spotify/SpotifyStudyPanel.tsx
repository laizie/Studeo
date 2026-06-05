// Music panel shown on the Study page.
// When Spotify is connected: shows current track + playlist picker.
// When not connected: shows a connect CTA.

import { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Search, Music, ListMusic } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useSpotifyStatus,
  useSpotifyPlayback,
  useSpotifyPlay,
  useSpotifyPause,
  useSpotifyNext,
  useSpotifyPrevious,
  useSpotifyUserPlaylists,
  useSpotifySearch,
} from '../../lib/queries/useSpotify';
import type { SpotifyPlaylist } from '../../../shared/types';
import SpotifySetupDialog from './SpotifySetupDialog';

// ── Playlist row ──────────────────────────────────────────────────────────────

function PlaylistRow({ playlist, onPlay }: { playlist: SpotifyPlaylist; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-[#442918] transition-colors text-left group"
    >
      <div className="w-8 h-8 rounded shrink-0 bg-stone-100 dark:bg-[#442918] overflow-hidden flex items-center justify-center">
        {playlist.imageUrl
          ? <img src={playlist.imageUrl} alt="" className="w-full h-full object-cover" />
          : <ListMusic size={13} className="text-stone-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 dark:text-[#f0e0cc] truncate leading-tight">
          {playlist.name}
        </p>
        <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">
          {playlist.trackCount} tracks
        </p>
      </div>
      <div className="shrink-0 w-6 h-6 rounded-full bg-[#1DB954] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Play size={9} fill="white" className="text-white ml-0.5" />
      </div>
    </button>
  );
}

// ── Playback controls strip ───────────────────────────────────────────────────

function PlaybackControls() {
  const { data: playback }  = useSpotifyPlayback();
  const play    = useSpotifyPlay();
  const pause   = useSpotifyPause();
  const next    = useSpotifyNext();
  const previous = useSpotifyPrevious();

  const track = playback?.track;

  function togglePlayPause() {
    if (playback?.isPlaying) pause.mutate();
    else play.mutate(undefined);
  }

  const pct = track
    ? Math.min(100, ((playback?.progressMs ?? 0) / track.durationMs) * 100)
    : 0;

  return (
    <div className="mt-3 pt-3 border-t border-stone-200 dark:border-[#442918]">
      {/* Track info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg shrink-0 bg-stone-100 dark:bg-[#442918] overflow-hidden flex items-center justify-center">
          {track?.albumArt
            ? <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
            : <Music size={16} className="text-stone-300" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800 dark:text-[#f0e0cc] truncate">
            {track?.name ?? 'Nothing playing'}
          </p>
          <p className="text-xs text-stone-400 dark:text-[#c4a882] truncate mt-0.5">
            {track?.artists.join(', ') ?? '—'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-stone-100 dark:bg-[#442918] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-[#1DB954] rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => previous.mutate()}
          disabled={previous.isPending}
          className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-[#e8d5c0] transition-colors disabled:opacity-40"
          title="Previous"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={togglePlayPause}
          disabled={play.isPending || pause.isPending}
          className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center text-white hover:bg-[#17a349] transition-colors disabled:opacity-40 shadow-sm"
          title={playback?.isPlaying ? 'Pause' : 'Play'}
        >
          {playback?.isPlaying
            ? <Pause size={14} fill="white" />
            : <Play  size={14} fill="white" className="ml-0.5" />
          }
        </button>
        <button
          onClick={() => next.mutate()}
          disabled={next.isPending}
          className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-[#e8d5c0] transition-colors disabled:opacity-40"
          title="Next"
        >
          <SkipForward size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SpotifyStudyPanel() {
  const { data: status } = useSpotifyStatus();
  const { data: userPlaylists = [], isLoading: playlistsLoading } = useSpotifyUserPlaylists();

  const [query, setQuery]     = useState('');
  const [tab, setTab]         = useState<'yours' | 'search'>('yours');
  const [setupOpen, setSetupOpen] = useState(false);

  const { data: searchResults = [], isFetching: searching } = useSpotifySearch(query);
  const play = useSpotifyPlay();

  if (!status) return null;

  if (!status.connected) {
    return (
      <>
        <div className="w-full">
          <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide mb-3">
            Music
          </h2>
          <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-stone-200 dark:border-[#442918] gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
              <Music size={18} className="text-[#1DB954]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-stone-700 dark:text-[#d4b896]">Connect Spotify</p>
              <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">Control music without leaving ClassTrack</p>
            </div>
            <button
              onClick={() => setSetupOpen(true)}
              className="px-4 py-2 rounded-lg bg-[#1DB954] text-white text-sm font-medium hover:bg-[#17a349] transition-colors"
            >
              Connect Spotify
            </button>
          </div>
        </div>
        <SpotifySetupDialog isOpen={setupOpen} onClose={() => setSetupOpen(false)} />
      </>
    );
  }

  const displayList = tab === 'search' ? searchResults : userPlaylists;
  const isLoading   = tab === 'yours' ? playlistsLoading : searching;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide">
          Music
        </h2>
        <span className="flex items-center gap-1 text-[10px] text-[#1DB954]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
          {status.displayName}
        </span>
      </div>

      {/* Playback controls */}
      <PlaybackControls />

      {/* Playlist picker */}
      <div className="mt-5">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-stone-100 dark:bg-[#2d1a08] rounded-lg mb-3 w-fit">
          {(['yours', 'search'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                tab === t
                  ? 'bg-white dark:bg-[#664433] text-stone-800 dark:text-[#f0e0cc] shadow-sm font-medium'
                  : 'bg-stone-200/70 dark:bg-[#442918] text-stone-600 dark:text-[#c4a882] hover:bg-stone-200 dark:hover:bg-[#553311]'
              )}
            >
              {t === 'yours' ? 'Your playlists' : 'Search'}
            </button>
          ))}
        </div>

        {/* Search input */}
        {tab === 'search' && (
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-300 dark:text-[#775544]" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search Spotify playlists…"
              className={cn(
                'w-full pl-8 pr-3 py-2 text-sm border rounded-lg',
                'border-stone-200 dark:border-[#442918]',
                'bg-white dark:bg-[#332211]',
                'text-stone-800 dark:text-[#f0e0cc]',
                'placeholder:text-stone-300 dark:placeholder:text-[#775544]',
                'focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40',
              )}
            />
          </div>
        )}

        {/* List */}
        <div className="max-h-48 overflow-y-auto -mx-1">
          {isLoading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-stone-100 dark:bg-[#442918] animate-pulse" />
              ))}
            </div>
          ) : displayList.length === 0 ? (
            <p className="px-3 py-4 text-sm text-stone-400 dark:text-[#c4a882] text-center">
              {tab === 'search' && query.length > 1
                ? 'No playlists found.'
                : tab === 'search'
                  ? 'Type to search…'
                  : 'No playlists found.'}
            </p>
          ) : (
            displayList.map(pl => (
              <PlaylistRow
                key={pl.id}
                playlist={pl}
                onPlay={() => play.mutate(pl.uri)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
