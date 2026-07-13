import { Play, Pause, SkipForward, SkipBack, Music } from 'lucide-react';
import {
  useAppleMusicStatus,
  useAppleMusicPlayback,
  useAppleMusicPlay,
  useAppleMusicPause,
  useAppleMusicNext,
  useAppleMusicPrevious,
} from '../../lib/queries/useAppleMusic';

interface Props {
  borderless?: boolean;
}

function ProgressBar({ progressMs, durationMs }: { progressMs: number; durationMs: number }) {
  const pct = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;
  return (
    <div className="h-0.5 bg-white/20 rounded-full overflow-hidden mt-2">
      <div
        className="h-full bg-gradient-to-r from-[#fc3c44] to-[#ff6b6b] rounded-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ActivePlayer() {
  const { data: playback } = useAppleMusicPlayback();
  const play     = useAppleMusicPlay();
  const pause    = useAppleMusicPause();
  const next     = useAppleMusicNext();
  const previous = useAppleMusicPrevious();

  const track = playback?.track ?? null;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="shrink-0 w-8 h-8 rounded overflow-hidden bg-[#fc3c44]/20 flex items-center justify-center">
          {track?.artworkUrl
            ? <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
            : <Music size={13} className="text-[#fc3c44]" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-sidebar-ink truncate leading-tight">
            {track?.name ?? 'Nothing playing'}
          </p>
          <p className="text-caption text-sidebar-muted truncate leading-tight mt-0.5">
            {track?.artistName ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => previous.mutate()}
            disabled={previous.isPending}
            className="p-1 rounded text-sidebar-muted hover:text-sidebar-ink hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <SkipBack size={11} />
          </button>
          <button
            onClick={() => playback?.isPlaying ? pause.mutate() : play.mutate()}
            disabled={play.isPending || pause.isPending}
            className="p-1.5 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {playback?.isPlaying
              ? <Pause size={10} fill="white" />
              : <Play  size={10} fill="white" />
            }
          </button>
          <button
            onClick={() => next.mutate()}
            disabled={next.isPending}
            className="p-1 rounded text-sidebar-muted hover:text-sidebar-ink hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <SkipForward size={11} />
          </button>
        </div>
      </div>
      {track && (
        <ProgressBar progressMs={playback?.progressMs ?? 0} durationMs={track.durationMs} />
      )}
    </div>
  );
}

export default function AppleMusicMiniPlayer({ borderless }: Props = {}) {
  const { data: status } = useAppleMusicStatus();

  const borderClass = borderless ? undefined : 'border-t border-sidebar-line';

  if (!status?.running) {
    return (
      <div className={borderClass}>
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-4 h-4 rounded-full bg-[#fc3c44]/20 flex items-center justify-center shrink-0">
              <Music size={9} className="text-[#fc3c44]" />
            </div>
            <span className="text-xs text-[#775544]">Open Music app to connect</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={borderClass}>
      <div className="flex items-center px-3 pt-2 pb-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b] shrink-0" />
          <span className="text-caption text-sidebar-muted">Apple Music</span>
        </div>
      </div>
      <ActivePlayer />
    </div>
  );
}
