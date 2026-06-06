import { Play, Pause, SkipForward, SkipBack, Music, ListMusic } from 'lucide-react';
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
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-[#2d1a08] warm:hover:bg-[#4c2e18] transition-colors text-left group"
    >
      <div className="w-9 h-9 rounded-lg shrink-0 overflow-hidden bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] flex items-center justify-center">
        {playlist.artworkUrl
          ? <img src={playlist.artworkUrl} alt="" className="w-full h-full object-cover" />
          : <ListMusic size={14} className="text-stone-400 dark:text-[#775544]" />
        }
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

  const track      = playback?.track ?? null;
  const progressMs = playback?.progressMs ?? 0;
  const durationMs = track?.durationMs ?? 0;
  const pct        = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-4 pt-1 pb-2 shrink-0">

      {/* Album art */}
      <div className="w-40 h-40 rounded-2xl bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] overflow-hidden flex items-center justify-center shadow-lg">
        {track?.artworkUrl
          ? <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
          : <Music size={40} className="text-stone-200 dark:text-[#3d2318]" />
        }
      </div>

      {/* Track info */}
      <div className="text-center w-full min-w-0 px-2">
        <p className="text-base font-semibold text-stone-800 dark:text-[#f0e0cc] truncate leading-snug">
          {track?.name ?? 'Nothing playing'}
        </p>
        <p className="text-sm text-stone-400 dark:text-[#c4a882] truncate mt-0.5">
          {track?.artistName ?? '—'}
        </p>
      </div>

      {/* Progress bar + timestamps */}
      <div className="w-full px-1">
        <div className="h-1.5 bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#fc3c44] to-[#ff6b6b] rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] tabular-nums text-stone-400 dark:text-[#c4a882]">
            {formatMs(progressMs)}
          </span>
          <span className="text-[10px] tabular-nums text-stone-400 dark:text-[#c4a882]">
            {formatMs(durationMs)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => previous.mutate()}
          disabled={previous.isPending}
          className="p-2 text-stone-400 hover:text-stone-700 dark:hover:text-[#e8d5c0] transition-colors disabled:opacity-40"
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
          className="p-2 text-stone-400 hover:text-stone-700 dark:hover:text-[#e8d5c0] transition-colors disabled:opacity-40"
        >
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AppleMusicStudyPanel() {
  const { data: status }                              = useAppleMusicStatus();
  const { data: playlists = [], isLoading: playlistsLoading } = useAppleMusicPlaylists();
  const playPlaylist = useAppleMusicPlayPlaylist();

  if (!status?.running) {
    return (
      <div className="w-full">
        <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide mb-3">
          Music
        </h2>
        <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-stone-200 dark:border-[#3d2b1f] warm:border-[#5d4b3f] gap-3">
          <div className="w-10 h-10 rounded-full bg-[#fc3c44]/10 flex items-center justify-center">
            <Music size={18} className="text-[#fc3c44]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-stone-700 dark:text-[#d4b896]">Open Music app</p>
            <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">
              Studeo controls Apple Music via the Music app — open it to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">

      {/* Section header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide">Music</h2>
        <span className="flex items-center gap-1 text-[10px] text-[#fc3c44]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fc3c44]" />
          Apple Music
        </span>
      </div>

      {/* Now playing */}
      <PlaybackControls />

      {/* Divider */}
      <div className="border-t border-stone-100 dark:border-[#2d1a08] warm:border-[#4c2e18] my-4 shrink-0" />

      {/* Playlists */}
      <div>
        <p className="text-xs font-medium text-stone-500 dark:text-[#c4a882] mb-2">Your playlists</p>
        <div className="max-h-52 overflow-y-auto -mx-1">
          {playlistsLoading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] animate-pulse" />
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
