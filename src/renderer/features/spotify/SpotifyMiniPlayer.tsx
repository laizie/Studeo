// Sidebar mini player — shows current Spotify playback state with controls.
// Designed to fit inside the 224px sidebar with consistent dark-warm theming.

import { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music, LogOut } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useSpotifyStatus,
  useSpotifyPlayback,
  useSpotifyPlay,
  useSpotifyPause,
  useSpotifyNext,
  useSpotifyPrevious,
  useSpotifyDisconnect,
} from '../../lib/queries/useSpotify';
import SpotifySetupDialog from './SpotifySetupDialog';

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progressMs, durationMs }: { progressMs: number; durationMs: number }) {
  const pct = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;
  return (
    <div className="h-0.5 bg-white/20 rounded-full overflow-hidden mt-2">
      <div
        className="h-full bg-[#1DB954] rounded-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Mini player (when connected + playing) ────────────────────────────────────

function ActivePlayer() {
  const { data: playback } = useSpotifyPlayback();
  const play      = useSpotifyPlay();
  const pause     = useSpotifyPause();
  const next      = useSpotifyNext();
  const previous  = useSpotifyPrevious();

  const track = playback?.track ?? null;

  function togglePlayPause() {
    if (playback?.isPlaying) pause.mutate();
    else play.mutate(undefined);
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        {/* Album art */}
        <div className="shrink-0 w-8 h-8 rounded bg-[#1DB954]/20 overflow-hidden flex items-center justify-center">
          {track?.albumArt ? (
            <img src={track.albumArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music size={13} className="text-[#1DB954]" />
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-sidebar-ink truncate leading-tight">
            {track?.name ?? 'Nothing playing'}
          </p>
          <p className="text-caption text-sidebar-muted truncate leading-tight mt-0.5">
            {track?.artists.join(', ') ?? '—'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => previous.mutate()}
            disabled={previous.isPending}
            className="p-1 rounded text-sidebar-muted hover:text-sidebar-ink hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Previous"
          >
            <SkipBack size={11} />
          </button>
          <button
            onClick={togglePlayPause}
            disabled={play.isPending || pause.isPending}
            className="p-1.5 rounded-full bg-[#1DB954] text-white hover:bg-[#17a349] transition-colors disabled:opacity-40"
            title={playback?.isPlaying ? 'Pause' : 'Play'}
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
            title="Next"
          >
            <SkipForward size={11} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {track && (
        <ProgressBar
          progressMs={playback?.progressMs ?? 0}
          durationMs={track.durationMs}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  /** Suppress the top border when rendered inside a tabbed container that already has one. */
  borderless?: boolean;
}

export default function SpotifyMiniPlayer({ borderless }: Props = {}) {
  const { data: status } = useSpotifyStatus();
  const disconnect       = useSpotifyDisconnect();
  const [setupOpen, setSetupOpen] = useState(false);
  const [showMenu, setShowMenu]   = useState(false);

  return (
    <>
      <div className={borderless ? undefined : 'border-t border-sidebar-line'}>
        {!status ? (
          // Loading — show nothing
          null
        ) : !status.connected ? (
          // Not connected — small connect prompt
          <div className="px-3 py-2.5">
            <button
              onClick={() => setSetupOpen(true)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink transition-colors"
            >
              <div className="w-4 h-4 rounded-full bg-[#1DB954]/20 flex items-center justify-center shrink-0">
                <Music size={9} className="text-[#1DB954]" />
              </div>
              <span className="text-xs">Connect Spotify</span>
            </button>
          </div>
        ) : (
          // Connected
          <div>
            <div className="flex items-center justify-between px-3 pt-2 pb-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#1DB954] shrink-0" />
                <span className="text-caption text-sidebar-muted truncate max-w-[120px]">
                  {status.displayName}
                </span>
              </div>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded text-[#775544] hover:text-sidebar-muted transition-colors"
                title="Spotify options"
              >
                <LogOut size={10} />
              </button>
            </div>

            {showMenu && (
              <div className="mx-3 mb-1 mt-1 bg-sidebar-line rounded-lg overflow-hidden">
                <button
                  onClick={() => { disconnect.mutate(); setShowMenu(false); }}
                  disabled={disconnect.isPending}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs text-sidebar-muted hover:bg-[#553311]',
                    'hover:text-sidebar-ink transition-colors disabled:opacity-50'
                  )}
                >
                  Disconnect Spotify
                </button>
              </div>
            )}

            <ActivePlayer />
          </div>
        )}
      </div>

      <SpotifySetupDialog isOpen={setupOpen} onClose={() => setSetupOpen(false)} />
    </>
  );
}
