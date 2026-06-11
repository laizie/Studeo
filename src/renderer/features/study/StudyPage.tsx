import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Plus, X, BookOpen, ListTodo, CheckCircle2, Circle, Timer, Music2 } from 'lucide-react';
import { useTimerStore, FOCUS_OPTIONS, BREAK_OPTIONS, type Phase } from '../../store/useTimerStore';
import { useStudyListStore } from '../../store/useStudyListStore';
import { useUpdateAssignment } from '../../lib/queries/useAssignments';
import { useUpdateTask } from '../../lib/queries/useTasks';
import StudyPickerDialog from './StudyPickerDialog';
import AppleMusicStudyPanel from '../applemusic/AppleMusicStudyPanel';
import SpotifyStudyPanel from '../spotify/SpotifyStudyPanel';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

// ── Study technique presets ───────────────────────────────────────────────────

interface Technique {
  id: string;
  label: string;
  focusMins: number;
  breakMins: number;
  desc: string;
}

const TECHNIQUES: Technique[] = [
  {
    id:        'pomodoro',
    label:     'Pomodoro',
    focusMins: 25,
    breakMins: 5,
    desc:      '25 min focus · 5 min break — the classic method to stay consistently productive',
  },
  {
    id:        '5217',
    label:     '52 / 17',
    focusMins: 52,
    breakMins: 17,
    desc:      '52 min deep work · 17 min break — based on research into top performers',
  },
  {
    id:        'deepwork',
    label:     'Deep Work',
    focusMins: 90,
    breakMins: 20,
    desc:      '90 min focus · 20 min break — aligned with the brain\'s ultradian rhythm',
  },
  {
    id:        'custom',
    label:     'Custom',
    focusMins: 0,
    breakMins: 0,
    desc:      'Set your own focus and break durations below',
  },
];

function detectTechnique(focusMins: number, breakMins: number): string {
  const match = TECHNIQUES.find(t => t.id !== 'custom' && t.focusMins === focusMins && t.breakMins === breakMins);
  return match?.id ?? 'custom';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
  focus:       'Focus',
  short_break: 'Break',
};

const PHASE_COLORS: Record<Phase, string> = {
  focus:       '#b85050',
  short_break: '#467a59', // deepened so white button text clears WCAG AA (4.5:1)
};

// Shared segmented-control styling so every selector on this screen speaks one
// visual language — white-on-track when selected — matching the phase tabs.
const SEG_GROUP = 'flex flex-wrap gap-1 p-1 bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] rounded-lg';
function segBtn(active: boolean): string {
  return cn(
    'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
    active
      ? 'bg-white dark:bg-[#553311] warm:bg-[#7e5a38] text-stone-800 dark:text-[#f0e0cc] shadow-sm'
      : 'text-stone-600 dark:text-[#d4b896] hover:bg-stone-200/60 dark:hover:bg-[#3d2318] warm:hover:bg-[#5d4338]',
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Progress ring ─────────────────────────────────────────────────────────────

const RADIUS        = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ phase, timeLeft, totalSecs }: { phase: Phase; timeLeft: number; totalSecs: number }) {
  const progress = totalSecs > 0 ? timeLeft / totalSecs : 1;
  const offset   = CIRCUMFERENCE * (1 - progress);
  const color    = PHASE_COLORS[phase];

  return (
    <svg viewBox="0 0 200 200" className="-rotate-90 w-[200px] h-[200px] lg:w-[220px] lg:h-[220px]">
      <circle cx={100} cy={100} r={RADIUS}
        fill="none" stroke="currentColor" strokeWidth={7}
        className="text-stone-100 dark:text-[#2d1a08]"
      />
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

// ── Focus list panel ──────────────────────────────────────────────────────────

function FocusListPanel() {
  const { items, toggleDone, removeItem, clear } = useStudyListStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const updateAssignment = useUpdateAssignment();
  const updateTask       = useUpdateTask();

  function handleToggle(id: string, type: 'assignment' | 'task', currentlyDone: boolean) {
    toggleDone(id);
    const status = currentlyDone ? 'not_started' : 'completed';
    if (type === 'assignment') {
      updateAssignment.mutate({ id, input: { status } });
    } else {
      updateTask.mutate({ id, input: { status } });
    }
  }

  const doneCount = items.filter(i => i.done).length;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-700 dark:text-[#d4b896]">
            Today's Focus List
          </h2>
          {items.length > 0 && (
            <p className="text-xs text-stone-500 dark:text-[#e0b870] mt-0.5">
              {doneCount} of {items.length} done
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={clear}
              className="text-xs text-stone-500 dark:text-[#c4a882] hover:text-stone-600 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full py-8 text-center border-2 border-dashed border-stone-200 dark:border-[#3d2b1f] warm:border-[#5d4b3f] rounded-xl cursor-pointer hover:border-stone-300 dark:hover:border-[#664433] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 transition-colors"
        >
          <p className="text-sm text-stone-500 dark:text-[#cc9a58]">
            No assignments or tasks added yet.
          </p>
          <p className="text-xs text-stone-500 dark:text-[#bb8c50] mt-1">
            Click to pick what you're working on today
          </p>
        </button>
      ) : (
        <div className="bg-stone-50 dark:bg-[#2d1a08] warm:bg-[#4c2e18] border border-stone-200 dark:border-[#3d2b1f] warm:border-[#5d4b3f] rounded-xl overflow-hidden divide-y divide-stone-100 dark:divide-[#3d2b1f] warm:divide-[#5d4b3f]">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 group hover:bg-white dark:hover:bg-[#3d2318] warm:hover:bg-[#5d4338] transition-colors"
            >
              <button
                onClick={() => handleToggle(item.id, item.type, item.done)}
                className="shrink-0 hover:scale-110 transition-transform"
                title={item.done ? 'Mark incomplete' : 'Mark complete'}
              >
                {item.done
                  ? <CheckCircle2 size={17} className="text-green-500" />
                  : <Circle size={17} className="text-stone-500 dark:text-[#775544]" />
                }
              </button>

              <span className={cn(
                'flex-1 text-sm truncate',
                item.done
                  ? 'line-through text-stone-500 dark:text-[#cc9a58]'
                  : 'text-stone-800 dark:text-[#f0e0cc]'
              )}>
                {item.name}
              </span>

              <span className="shrink-0 hidden sm:flex items-center gap-1 text-xs text-stone-500 dark:text-[#c4a882]">
                {item.type === 'assignment'
                  ? <BookOpen size={11} />
                  : <ListTodo size={11} />
                }
              </span>

              {item.courseName && (
                <span
                  className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: `${item.courseColor}40`,
                    color: item.courseColor,
                  }}
                >
                  {item.courseName}
                </span>
              )}

              <button
                onClick={() => removeItem(item.id)}
                aria-label={`Remove ${item.name} from focus list`}
                title="Remove from focus list"
                className="shrink-0 p-1 rounded text-stone-500 dark:text-[#c4a882] hover:text-stone-700 dark:hover:text-[#e8d5c0] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 transition"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <StudyPickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

// ── Music study column ────────────────────────────────────────────────────────

function MusicStudyColumn() {
  const { defaultMusicService } = useSettingsStore();

  if (!defaultMusicService) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center h-full">
        <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] flex items-center justify-center">
          <Music2 size={18} className="text-stone-500 dark:text-[#c4a882]" />
        </div>
        <div>
          <p className="text-sm font-medium text-stone-600 dark:text-[#d4b896]">No music service selected</p>
          <p className="text-xs text-stone-500 dark:text-[#c4a882] mt-1">
            Choose Spotify or Apple Music in Settings
          </p>
        </div>
        <Link
          to="/settings"
          className="mt-1 px-4 py-2 rounded-lg bg-[#e2a53b] text-[#1e1208] text-sm font-medium hover:bg-[#d49530] transition-colors"
        >
          Open Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {defaultMusicService === 'spotify' ? <SpotifyStudyPanel /> : <AppleMusicStudyPanel />}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const {
    phase, isRunning, timeLeft, autoAdvance, focusSecs, breakSecs,
    setPhase, start, pause, reset, toggleAutoAdvance,
    setFocusMins, setBreakMins,
  } = useTimerStore();

  const totalSecs = phase === 'focus' ? focusSecs : breakSecs;
  const focusMins = focusSecs / 60;
  const breakMins = breakSecs / 60;

  const [techniqueId, setTechniqueId] = useState(
    () => detectTechnique(focusMins, breakMins)
  );

  function applyTechnique(t: Technique) {
    setTechniqueId(t.id);
    if (t.id !== 'custom') {
      setFocusMins(t.focusMins);
      setBreakMins(t.breakMins);
    }
  }

  // The countdown itself is driven app-wide from Layout (useTimerDriver), so it
  // survives navigation. Here we only wire up keyboard control while on this screen.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) pause(); else start();
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRunning, pause, start, reset]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const color           = PHASE_COLORS[phase];
  const activeTechnique = TECHNIQUES.find(t => t.id === techniqueId) ?? TECHNIQUES[0];

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc] mb-6">Study</h1>

        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── Timer card ───────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-[#1e1008] warm:bg-[#3e2818] border border-stone-200 dark:border-[#3d2b1f] warm:border-[#5d4b3f] rounded-2xl shadow-sm p-6 w-full lg:w-[360px] shrink-0 flex flex-col items-center">

            {/* Card header */}
            <div className="flex items-center gap-2 mb-5 self-start">
              <Timer size={14} className="text-stone-500 dark:text-[#c4a882]" />
              <h2 className="text-sm font-semibold text-stone-600 dark:text-[#d4b896] tracking-tight">
                Focus Timer
              </h2>
            </div>

            {/* Technique selector */}
            <div className="w-full mb-5">
              <p className="text-xs font-medium text-stone-500 dark:text-[#c4a882] uppercase tracking-wide mb-2">
                Technique
              </p>
              <div className={SEG_GROUP}>
                {TECHNIQUES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => applyTechnique(t)}
                    className={segBtn(techniqueId === t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {activeTechnique.id !== 'custom' && (
                <p className="mt-2 text-xs text-stone-500 dark:text-[#cc9a58] leading-relaxed">
                  {activeTechnique.desc}
                </p>
              )}
            </div>

            {/* Phase tabs */}
            <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#2d1a08] warm:bg-[#4c2e18] rounded-lg mb-7 self-stretch justify-center">
              {(Object.keys(PHASE_LABELS) as Phase[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPhase(p)}
                  className={cn(
                    'flex-1 px-4 py-1.5 text-sm rounded-md transition-colors',
                    phase === p
                      ? 'bg-white dark:bg-[#553311] warm:bg-[#7e5a38] text-stone-800 dark:text-[#f0e0cc] shadow-sm font-medium'
                      : 'text-stone-500 dark:text-[#c4a882] hover:bg-stone-200/60 dark:hover:bg-[#3d2318] warm:hover:bg-[#5d4338]'
                  )}
                >
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Progress ring */}
            <div className="relative flex items-center justify-center mb-7">
              <ProgressRing phase={phase} timeLeft={timeLeft} totalSecs={totalSecs} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-5xl lg:text-[3.25rem] font-semibold tabular-nums tracking-tight"
                  style={{ color }}
                >
                  {formatTime(timeLeft)}
                </span>
                <span className="text-xs text-stone-500 dark:text-[#c4a882] mt-1">
                  {PHASE_LABELS[phase]}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={reset}
                title="Reset"
                className="p-2.5 text-stone-500 hover:text-stone-600 dark:hover:text-[#d4b896] rounded-full hover:bg-stone-100 dark:hover:bg-[#2d1a08] warm:hover:bg-[#4c2e18] transition-colors"
              >
                <RotateCcw size={17} />
              </button>
              <button
                onClick={isRunning ? pause : start}
                className="flex items-center gap-2 px-8 py-3 rounded-full text-white font-medium text-sm shadow-sm transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: color }}
              >
                {isRunning ? <Pause size={15} /> : <Play size={15} />}
                {isRunning ? 'Pause' : 'Start'}
              </button>
              <div className="w-[42px]" />
            </div>

            {/* Keyboard hint */}
            <p className="text-xs text-stone-500 dark:text-[#c4a882] mb-4">
              <kbd className="px-1.5 py-0.5 rounded border border-stone-200 dark:border-[#3d2b1f] font-sans">Space</kbd>
              <span className="mx-1.5">start / pause</span>·
              <kbd className="ml-1.5 px-1.5 py-0.5 rounded border border-stone-200 dark:border-[#3d2b1f] font-sans">R</kbd>
              <span className="ml-1.5">reset</span>
            </p>

            {/* Auto-advance */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-stone-500 dark:text-[#c4a882] mb-4">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={toggleAutoAdvance}
                className="accent-stone-600 dark:accent-[#e2a53b]"
              />
              Auto-advance to next phase
            </label>

            {/* Custom duration pickers */}
            {techniqueId === 'custom' && (
              <div className="w-full space-y-3 pt-3 border-t border-stone-100 dark:border-[#2d1a08] warm:border-[#4c2e18]">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-xs text-stone-500 dark:text-[#c4a882] shrink-0 text-right">Focus</span>
                  <div className={SEG_GROUP}>
                    {FOCUS_OPTIONS.map(m => (
                      <button key={m} onClick={() => setFocusMins(m)} className={segBtn(focusMins === m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-10 text-xs text-stone-500 dark:text-[#c4a882] shrink-0 text-right">Break</span>
                  <div className={SEG_GROUP}>
                    {BREAK_OPTIONS.map(m => (
                      <button key={m} onClick={() => setBreakMins(m)} className={segBtn(breakMins === m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Music card ────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-[#1e1008] warm:bg-[#3e2818] border border-stone-200 dark:border-[#3d2b1f] warm:border-[#5d4b3f] rounded-2xl shadow-sm p-6 w-full lg:flex-1 flex flex-col">
            <MusicStudyColumn />
          </div>

        </div>

        {/* ── Focus list card ───────────────────────────────────────────────── */}
        <div className="mt-5 bg-white dark:bg-[#1e1008] warm:bg-[#3e2818] border border-stone-200 dark:border-[#3d2b1f] warm:border-[#5d4b3f] rounded-2xl shadow-sm p-6">
          <FocusListPanel />
        </div>

      </div>
    </div>
  );
}
