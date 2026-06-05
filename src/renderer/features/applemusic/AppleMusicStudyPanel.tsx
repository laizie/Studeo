import { Play, Pause, SkipForward, SkipBack, Music, ListMusic } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useAppleMusicStatus,
  useAppleMusicPlayback,
  useAppleMusicPlaylists,
  useAppleMusicPlay,
  useAppleMusicPause,
  useAppleMusicNext,
  useAppleMusicPrevious,
  useAppleMusicPlayPlaylist,
} from '../../lib/queries/useAppleMusic';
import type { AppleMusicPlaylist } from '../../../shared/types';

// ── Playlist row ──────────────────────────────────────────────────────────────

function PlaylistRow({ playlist, onPlay }: { playlist: AppleMusicPlaylist; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-[#442918] transition-colors text-left group"
    >
      <div className="w-8 h-8 rounded shrink-0 bg-stone-100 dark:bg-[#442918] flex items-center justify-center">
        <ListMusic size={13} className="text-stone-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 dark:text-[#f0e0cc] truncate leading-tight">{playlist.name}</p>
        <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">{playlist.trackCount} tracks</p>
      </div>
      <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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

  const track = playback?.track ?? null;
  const pct   = track ? Math.min(100, ((playback?.progressMs ?? 0) / track.durationMs) * 100) : 0;

  return (
    <div className="mt-3 pt-3 border-t border-stone-200 dark:border-[#442918]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg shrink-0 bg-stone-100 dark:bg-[#442918] overflow-hidden flex items-center justify-center">
          {track?.artworkUrl
            ? <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
            : <Music size={16} className="text-stone-300" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800 dark:text-[#f0e0cc] truncate">
            {track?.name ?? 'Nothing playing'}
          </p>
          <p className="text-xs text-stone-400 dark:text-[#c4a882] truncate mt-0.5">
            {track?.artistName ?? '—'}
          </p>
        </div>
      </div>

      <div className="h-1 bg-stone-100 dark:bg-[#442918] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-[#fc3c44] to-[#ff6b6b] rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => previous.mutate()}
          disabled={previous.isPending}
          className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-[#e8d5c0] transition-colors disabled:opacity-40"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={() => playback?.isPlaying ? pause.mutate() : play.mutate()}
          disabled={play.isPending || pause.isPending}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] flex items-center justify-center text-white hover:opacity-90 transition-opacity shadow-sm disabled:opacity-40"
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
        >
          <SkipForward size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AppleMusicStudyPanel() {
  const { data: status }              = useAppleMusicStatus();
  const { data: playlists = [],
          isLoading: playlistsLoading } = useAppleMusicPlaylists();
  const playPlaylist = useAppleMusicPlayPlaylist();

  if (!status?.running) {
    return (
      <div className="w-full">
        <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide mb-3">
          Music
        </h2>
        <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-stone-200 dark:border-[#442918] gap-3">
          <div className="w-10 h-10 rounded-full bg-[#fc3c44]/10 flex items-center justify-center">
            <Music size={18} className="text-[#fc3c44]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-stone-700 dark:text-[#d4b896]">Open Music app</p>
            <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">
              ClassTrack controls Apple Music via the Music app — open it to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide">Music</h2>
        <span className="flex items-center gap-1 text-[10px] text-[#fc3c44]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fc3c44]" />
          Apple Music
        </span>
      </div>

      <PlaybackControls />

      <div className="mt-5">
        <p className="text-xs font-medium text-stone-500 dark:text-[#c4a882] mb-2">Your playlists</p>
        <div className="max-h-48 overflow-y-auto -mx-1">
          {playlistsLoading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-stone-100 dark:bg-[#442918] animate-pulse" />
              ))}
            </div>
          ) : playlists.length === 0 ? (
            <p className="px-3 py-4 text-sm text-stone-400 dark:text-[#c4a882] text-center">
              No playlists found in Music app.
            </p>
          ) : (
            playlists.map(pl => (
              <PlaylistRow
                key={pl.id}
                playlist={pl}
                onPlay={() => playPlaylist.mutate(pl.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
