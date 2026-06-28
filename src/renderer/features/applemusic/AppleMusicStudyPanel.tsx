import { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music, ListMusic, Search } from 'lucide-react';
import {
  useAppleMusicStatus,
  useAppleMusicPlayback,
  useAppleMusicPlaylists,
  useAppleMusicPlay,
  useAppleMusicPause,
  useAppleMusicNext,
  useAppleMusicPrevious,
  useAppleMusicPlayPlaylist,
  useAppleMusicSearchLibrary,
  useAppleMusicPlayTrack,
} from '../../lib/queries/useAppleMusic';
import type { AppleMusicPlaylist, AppleMusicTrack } from '../../../shared/types';

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Playlist row ──────────────────────────────────────────────────────────────

function PlaylistRow({ playlist, onPlay }: { playlist: AppleMusicPlaylist; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors text-left group"
    >
      <div className="w-9 h-9 rounded-lg shrink-0 overflow-hidden bg-inset flex items-center justify-center">
        {playlist.artworkUrl
          ? <img src={playlist.artworkUrl} alt="" className="w-full h-full object-cover" />
          : <ListMusic size={14} className="text-stone-500 dark:text-muted" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate leading-tight">{playlist.name}</p>
        <p className="text-xs text-muted mt-0.5">{playlist.trackCount} tracks</p>
      </div>
      <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Play size={9} fill="white" className="text-white ml-0.5" />
      </div>
    </button>
  );
}

// ── Track row (library search result) ─────────────────────────────────────────

function TrackRow({ track, onPlay }: { track: AppleMusicTrack; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors text-left group"
    >
      <div className="w-9 h-9 rounded-lg shrink-0 bg-inset flex items-center justify-center">
        <Music size={14} className="text-stone-500 dark:text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate leading-tight">{track.name}</p>
        <p className="text-xs text-muted mt-0.5 truncate">
          {track.artistName}{track.albumName ? ` · ${track.albumName}` : ''}
        </p>
      </div>
      <span className="text-[10px] tabular-nums text-stone-500 dark:text-muted shrink-0 mr-1 group-hover:hidden">
        {formatMs(track.durationMs)}
      </span>
      <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex">
        <Play size={9} fill="white" className="text-white ml-0.5" />
      </div>
    </button>
  );
}

// ── Playback controls ─────────────────────────────────────────────────────────

function PlaybackControls() {
  const { data: playback } = useAppleMusicPlayback();
  const play     = useAppleMusicPlay();
  const pause    = useAppleMusicPause();
  const next     = useAppleMusicNext();
  const previous = useAppleMusicPrevious();

  const track      = playback?.track ?? null;
  const progressMs = playback?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;
  const pct        = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-4 pt-1 pb-2 shrink-0">

      {/* Album art */}
      <div className="w-40 h-40 rounded-2xl bg-inset overflow-hidden flex items-center justify-center shadow-lg">
        {track?.artworkUrl
          ? <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
          : <Music size={40} className="text-stone-200 dark:text-line" />
        }
      </div>

      {/* Track info */}
      <div className="text-center w-full min-w-0 px-2">
        <p className="text-base font-semibold text-ink truncate leading-snug">
          {track?.name ?? 'Nothing playing'}
        </p>
        <p className="text-sm text-muted truncate mt-0.5">
          {track?.artistName ?? '—'}
        </p>
      </div>

      {/* Progress bar + timestamps */}
      <div className="w-full px-1">
        <div className="h-1.5 bg-inset rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#fc3c44] to-[#ff6b6b] rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] tabular-nums text-muted">
            {formatMs(progressMs)}
          </span>
          <span className="text-[10px] tabular-nums text-muted">
            {formatMs(durationMs)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => previous.mutate()}
          disabled={previous.isPending}
          className="p-2 text-stone-500 hover:text-stone-700 dark:hover:text-ink-soft transition-colors disabled:opacity-40"
        >
          <SkipBack size={20} />
        </button>
        <button
          onClick={() => playback?.isPlaying ? pause.mutate() : play.mutate()}
          disabled={play.isPending || pause.isPending}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] flex items-center justify-center text-white hover:opacity-90 transition-opacity shadow-md disabled:opacity-40"
        >
          {playback?.isPlaying
            ? <Pause size={16} fill="white" />
            : <Play  size={16} fill="white" className="ml-0.5" />
          }
        </button>
        <button
          onClick={() => next.mutate()}
          disabled={next.isPending}
          className="p-2 text-stone-500 hover:text-stone-700 dark:hover:text-ink-soft transition-colors disabled:opacity-40"
        >
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
}

// ── Search input ──────────────────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-2">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 dark:text-muted pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg bg-inset text-ink placeholder-stone-300 dark:placeholder:text-muted outline-none focus:ring-1 focus:ring-[#fc3c44]/40"
      />
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AppleMusicStudyPanel({ nowPlayingOnly = false }: { nowPlayingOnly?: boolean } = {}) {
  const { data: status }                              = useAppleMusicStatus();
  const { data: playlists = [], isLoading: playlistsLoading } = useAppleMusicPlaylists();
  const playPlaylist = useAppleMusicPlayPlaylist();
  const playTrack    = useAppleMusicPlayTrack();

  const [playlistFilter, setPlaylistFilter] = useState('');

  // Library search — debounce 400 ms so we don't fire on every keystroke
  const [libraryInput, setLibraryInput] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setLibraryQuery(libraryInput), 400);
    return () => clearTimeout(t);
  }, [libraryInput]);

  const { data: libraryResults = [], isFetching: libraryFetching } =
    useAppleMusicSearchLibrary(libraryQuery);

  if (!status?.running) {
    return (
      <div className="w-full">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          Music
        </h2>
        <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-line gap-3">
          <div className="w-10 h-10 rounded-full bg-[#fc3c44]/10 flex items-center justify-center">
            <Music size={18} className="text-[#fc3c44]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-ink-soft">Open Music app</p>
            <p className="text-xs text-muted mt-0.5">
              Studeo controls Apple Music via the Music app — open it to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!status.authorized) {
    return (
      <div className="w-full">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          Music
        </h2>
        <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-line gap-3 px-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Music size={18} className="text-amber-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-ink-soft">Permission needed</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Allow Studeo to control Music in{' '}
              <span className="font-medium text-ink-soft">
                System Settings → Privacy &amp; Security → Automation
              </span>
              , then restart the app.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Now-playing-only: either the user chose it, or the platform can't browse the
  // library (Windows SMTC exposes the current track but not playlists/search).
  const compact = nowPlayingOnly || status.canBrowseLibrary === false;
  if (compact) {
    return (
      <div className="w-full flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Music</h2>
          <span className="flex items-center gap-1 text-[10px] text-[#fc3c44]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fc3c44]" />
            Apple Music
          </span>
        </div>
        <PlaybackControls />
      </div>
    );
  }

  const filteredPlaylists = playlistFilter.trim()
    ? playlists.filter(pl =>
        pl.name.toLowerCase().includes(playlistFilter.toLowerCase())
      )
    : playlists;

  return (
    <div className="w-full flex flex-col">

      {/* Section header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Music</h2>
        <span className="flex items-center gap-1 text-[10px] text-[#fc3c44]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fc3c44]" />
          Apple Music
        </span>
      </div>

      {/* Now playing */}
      <PlaybackControls />

      {/* Divider */}
      <div className="border-t border-line my-4 shrink-0" />

      {/* Playlists */}
      <div>
        <p className="text-xs font-medium text-muted mb-2">Your playlists</p>
        <SearchInput
          value={playlistFilter}
          onChange={setPlaylistFilter}
          placeholder="Filter playlists…"
        />
        <div className="max-h-52 overflow-y-auto -mx-1">
          {playlistsLoading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-inset animate-pulse" />
              ))}
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted text-center">
              {playlistFilter ? 'No matching playlists.' : 'No playlists found in Music app.'}
            </p>
          ) : (
            filteredPlaylists.map(pl => (
              <PlaylistRow
                key={pl.id}
                playlist={pl}
                onPlay={() => playPlaylist.mutate(pl.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-line my-4 shrink-0" />

      {/* Library search */}
      <div>
        <p className="text-xs font-medium text-muted mb-2">Search library</p>
        <SearchInput
          value={libraryInput}
          onChange={setLibraryInput}
          placeholder="Search songs, artists, albums…"
        />
        <div className="max-h-52 overflow-y-auto -mx-1">
          {libraryFetching ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-inset animate-pulse" />
              ))}
            </div>
          ) : libraryQuery && libraryResults.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted text-center">
              No results for "{libraryQuery}"
            </p>
          ) : (
            libraryResults.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                onPlay={() => playTrack.mutate(track.id)}
              />
            ))
          )}
        </div>
      </div>

    </div>
  );
}
