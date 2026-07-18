// A single, polished "now playing" card — album art, track, a slim progress bar, and
// transport controls. It's purely presentational: it takes a normalized view and knows
// nothing about Spotify vs Apple Music, so the same clean card renders for either service
// (and for the auto "Now Playing" mode). AutoNowPlaying feeds it.
//
// It renders on two kinds of surface, so `tone` picks the text/track colors:
//  - 'dark'    — the always-dark sidebar and Focus Mode's dark room (light text). Default.
//  - 'surface' — a theme surface like the Study page card (theme text, flips with the theme).
// The accent color is passed in (Spotify green / Apple red / lamp amber) and drives the
// dot, the progress fill, and the play button on either tone.

import { Play, Pause, SkipForward, SkipBack, Music } from 'lucide-react';

export type NowPlayingTone = 'dark' | 'surface';

export interface NowPlayingView {
  /** Small label above the track, e.g. "Now Playing", "Spotify", "Apple Music". */
  serviceLabel: string;
  /** Hex accent for the dot, progress fill, and play button. */
  accent: string;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  /** Disable controls while a transport request is in flight. */
  busy?: boolean;
  tone?: NowPlayingTone;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

// Per-tone class sets. `dark` uses the fixed light-on-dark sidebar tokens; `surface` uses
// theme tokens that flip with light/dark mode.
const TONES: Record<NowPlayingTone, {
  label: string; title: string; sub: string; track: string; control: string;
}> = {
  dark: {
    label:   'text-sidebar-muted',
    title:   'text-sidebar-ink',
    sub:     'text-sidebar-muted',
    track:   'bg-white/10',
    control: 'text-sidebar-muted hover:text-sidebar-ink',
  },
  surface: {
    label:   'text-muted',
    title:   'text-ink-soft',
    sub:     'text-muted',
    track:   'bg-inset',
    control: 'text-muted hover:text-ink-soft',
  },
};

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function NowPlayingCard({
  serviceLabel, accent, title, artist, artworkUrl,
  isPlaying, progressMs, durationMs, busy, tone = 'dark',
  onPlayPause, onNext, onPrev,
}: NowPlayingView) {
  const pct = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;
  const hasTrack = Boolean(title);
  const t = TONES[tone];

  return (
    <div className="p-3.5">
      {/* Service badge */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <span className={`text-caption font-medium uppercase tracking-wider ${t.label}`}>
          {serviceLabel}
        </span>
      </div>

      {/* Track */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg"
          style={{ backgroundColor: `${accent}1f` }}
        >
          {artworkUrl
            ? <img src={artworkUrl} alt="" className="h-full w-full object-cover" />
            : <Music size={16} style={{ color: accent }} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium leading-tight ${t.title}`}>
            {title ?? 'Nothing playing'}
          </p>
          <p className={`mt-0.5 truncate text-xs leading-tight ${t.sub}`}>
            {artist ?? '—'}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3">
        <div className={`h-1 overflow-hidden rounded-full ${t.track}`}>
          <div
            className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%`, backgroundColor: accent }}
          />
        </div>
        {hasTrack && (
          <div className={`mt-1 flex justify-between text-caption tabular-nums ${t.sub}`}>
            <span>{formatMs(progressMs)}</span>
            <span>{formatMs(durationMs)}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-2 flex items-center justify-center gap-5">
        <button
          onClick={onPrev}
          disabled={busy}
          aria-label="Previous track"
          className={`transition-colors disabled:opacity-40 ${t.control}`}
        >
          <SkipBack size={15} />
        </button>
        <button
          onClick={onPlayPause}
          disabled={busy}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
          style={{ backgroundColor: accent }}
        >
          {isPlaying
            ? <Pause size={15} fill="white" />
            : <Play size={15} fill="white" className="ml-0.5" />}
        </button>
        <button
          onClick={onNext}
          disabled={busy}
          aria-label="Next track"
          className={`transition-colors disabled:opacity-40 ${t.control}`}
        >
          <SkipForward size={15} />
        </button>
      </div>
    </div>
  );
}
