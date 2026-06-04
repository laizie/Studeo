import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useTimerStore, FOCUS_OPTIONS, BREAK_OPTIONS, type Phase } from '../../store/useTimerStore';
import { cn } from '../../lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
  focus:       'Focus',
  short_break: 'Short Break',
  long_break:  'Long Break',
};

const PHASE_COLORS: Record<Phase, string> = {
  focus:       '#c35656',
  short_break: '#32b562',
  long_break:  '#6393e1',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Progress ring ─────────────────────────────────────────────────────────────
// SVG circle whose stroke shrinks from full circumference to zero as time elapses.
// rotated -90° so it starts from the top rather than the right.

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ phase, timeLeft, totalSecs }: { phase: Phase; timeLeft: number; totalSecs: number }) {
  const progress = totalSecs > 0 ? timeLeft / totalSecs : 1;
  const offset   = CIRCUMFERENCE * (1 - progress);
  const color    = PHASE_COLORS[phase];

  return (
    <svg
      viewBox="0 0 200 200"
      className="-rotate-90 w-[200px] h-[200px] lg:w-[230px] lg:h-[230px]"
    >
      {/* Track */}
      <circle cx={100} cy={100} r={RADIUS}
        fill="none" stroke="currentColor" strokeWidth={7} className="text-stone-200 dark:text-[#bb8c50]"
      />
      {/* Countdown arc */}
      <circle cx={100} cy={100} r={RADIUS}
        fill="none" stroke={color} strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s linear, stroke 0.3s ease' }}
      />
    </svg>
  );
}

// ── Music section ─────────────────────────────────────────────────────────────

type MusicProvider = 'spotify' | 'apple_music';

interface EmbedInfo {
  embedUrl: string;
  provider: MusicProvider;
  height: number;
  allow: string;
}

function toEmbedInfo(url: string): EmbedInfo | null {
  // Spotify: https://open.spotify.com/playlist/ID → embed variant
  const spotifyMatch = url.match(/open\.spotify\.com\/(playlist|track|album|artist)\/([a-zA-Z0-9]+)/);
  if (spotifyMatch) {
    return {
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}?utm_source=generator`,
      provider: 'spotify',
      height: 152,
      allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    };
  }

  // Apple Music: https://music.apple.com/us/... → https://embed.music.apple.com/us/...
  const appleMatch = url.match(/music\.apple\.com\/(.*)/);
  if (appleMatch) {
    return {
      embedUrl: `https://embed.music.apple.com/${appleMatch[1]}`,
      provider: 'apple_music',
      height: 175,
      allow: 'autoplay *; encrypted-media *; fullscreen *',
    };
  }

  return null;
}

const PROVIDER_LABELS: Record<MusicProvider, string> = {
  spotify:     'Open in Spotify',
  apple_music: 'Open in Apple Music',
};

function MusicSection() {
  const [musicUrl, setMusicUrl] = useState(
    () => localStorage.getItem('classtrack:musicUrl') ?? ''
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setMusicUrl(val);
    localStorage.setItem('classtrack:musicUrl', val);
  }

  const embed     = musicUrl ? toEmbedInfo(musicUrl) : null;
  const isInvalid = musicUrl.length > 0 && !embed;

  return (
    <div className="w-full max-w-md lg:flex-1 lg:flex lg:flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Music</h2>
        {embed && (
          <a
            href={musicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            {PROVIDER_LABELS[embed.provider]} ↗
          </a>
        )}
      </div>

      <input
        type="text"
        value={musicUrl}
        onChange={handleChange}
        placeholder="Paste a Spotify or Apple Music URL…"
        className={cn(
          'w-full px-3 py-2 text-sm border rounded-lg mb-3 shrink-0',
          'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent',
          'placeholder:text-stone-300',
          isInvalid ? 'border-red-300' : 'border-stone-200 dark:border-[#442918]',
          'dark:bg-[#332211] dark:text-[#f0e0cc] dark:placeholder:text-[#cc9a58]'
        )}
      />

      {isInvalid && (
        <p className="text-xs text-red-400 -mt-2 mb-3 shrink-0">
          Paste a Spotify or Apple Music URL (playlist, album, or track).
        </p>
      )}

      {embed && (
        <div className="flex-1 min-h-[175px] min-w-0">
          <iframe
            src={embed.embedUrl}
            width="100%"
            height="100%"
            allow={embed.allow}
            loading="lazy"
            className="rounded-xl border-0 block w-full h-full"
            title="Music Player"
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const {
    phase, isRunning, timeLeft, autoAdvance, focusSecs, breakSecs,
    setPhase, start, pause, reset, tick, toggleAutoAdvance,
    setFocusMins, setBreakMins,
  } = useTimerStore();

  const totalSecs = phase === 'focus' ? focusSecs : breakSecs;
  const focusMins = focusSecs / 60;
  const breakMins = breakSecs / 60;

  // The timer interval lives here in React so cleanup is automatic.
  // Zustand owns the state; React owns the clock.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => tick(), 1_000);
    return () => clearInterval(id);
  }, [isRunning, tick]);

  // Request notification permission once, after a user opens this page.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const color = PHASE_COLORS[phase];

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc] mb-8">Study</h1>

      <div className="flex flex-col lg:flex-row lg:gap-16 items-center lg:items-stretch">

        {/* ── Timer column ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center w-full max-w-sm shrink-0">

          {/* Phase tabs */}
          <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#553311] rounded-lg mb-10 self-stretch justify-center">
            {(Object.keys(PHASE_LABELS) as Phase[]).map(p => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md transition-colors',
                  phase === p
                    ? 'bg-white dark:bg-[#664433] text-stone-800 dark:text-[#f0e0cc] shadow-sm font-medium'
                    : 'text-stone-500 dark:text-[#c4a882] hover:text-stone-700 dark:hover:text-[#e8d5c0]'
                )}
              >
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Progress ring with time overlay */}
          <div className="relative flex items-center justify-center mb-8">
            <ProgressRing phase={phase} timeLeft={timeLeft} totalSecs={totalSecs} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-5xl lg:text-6xl font-semibold tabular-nums tracking-tight"
                style={{ color }}
              >
                {formatTime(timeLeft)}
              </span>
              <span className="text-xs text-stone-400 mt-1">{PHASE_LABELS[phase]}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 mb-5">
            <button
              onClick={reset}
              title="Reset"
              className="p-2.5 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-colors"
            >
              <RotateCcw size={18} />
            </button>
            <button
              onClick={isRunning ? pause : start}
              className="flex items-center gap-2 px-8 py-3 rounded-full text-white font-medium text-sm shadow-sm transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: color }}
            >
              {isRunning ? <Pause size={16} /> : <Play size={16} />}
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <div className="w-[42px]" />
          </div>

          {/* Auto-advance */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-stone-500 mb-6">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={toggleAutoAdvance}
              className="accent-stone-600"
            />
            Auto-advance to next phase
          </label>

          {/* Duration options */}
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-12 text-xs text-stone-400 shrink-0 text-right">Focus</span>
              <div className="flex gap-1.5">
                {FOCUS_OPTIONS.map(m => (
                  <button
                    key={m}
                    onClick={() => setFocusMins(m)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-md transition-colors',
                      focusMins === m
                        ? 'bg-stone-800 text-white font-medium'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-12 text-xs text-stone-400 shrink-0 text-right">Break</span>
              <div className="flex gap-1.5">
                {BREAK_OPTIONS.map(m => (
                  <button
                    key={m}
                    onClick={() => setBreakMins(m)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-md transition-colors',
                      breakMins === m
                        ? 'bg-stone-800 text-white font-medium'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Dividers ──────────────────────────────────────────────────────── */}
        {/* Horizontal on small screens, vertical on large */}
        <div className="w-full max-w-sm h-px bg-stone-200 my-10 lg:hidden" />
        <div className="hidden lg:block w-px self-stretch bg-stone-200 shrink-0" />

        {/* ── Music column ─────────────────────────────────────────────────── */}
        <div className="w-full max-w-md lg:flex-1 lg:max-w-xl lg:flex lg:flex-col">
          <MusicSection />
        </div>

      </div>
      </div>
    </div>
  );
}
