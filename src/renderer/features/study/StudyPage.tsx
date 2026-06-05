import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Plus, X, BookOpen, ListTodo, CheckCircle2, Circle } from 'lucide-react';
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
  focus:       '#c35656',
  short_break: '#32b562',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Progress ring ─────────────────────────────────────────────────────────────

const RADIUS       = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ phase, timeLeft, totalSecs }: { phase: Phase; timeLeft: number; totalSecs: number }) {
  const progress = totalSecs > 0 ? timeLeft / totalSecs : 1;
  const offset   = CIRCUMFERENCE * (1 - progress);
  const color    = PHASE_COLORS[phase];

  return (
    <svg viewBox="0 0 200 200" className="-rotate-90 w-[200px] h-[200px] lg:w-[230px] lg:h-[230px]">
      <circle cx={100} cy={100} r={RADIUS}
        fill="none" stroke="currentColor" strokeWidth={7}
        className="text-stone-200 dark:text-[#bb8c50]"
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
      <div className="mt-10 pt-8 border-t border-stone-200 dark:border-[#442918]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-stone-700 dark:text-[#d4b896]">
              Today's Focus List
            </h2>
            {items.length > 0 && (
              <p className="text-xs text-stone-400 dark:text-[#e0b870] mt-0.5">
                {doneCount} of {items.length} done
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={clear}
                className="text-xs text-stone-400 dark:text-[#c4a882] hover:text-stone-600 transition-colors"
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
          <div
            onClick={() => setPickerOpen(true)}
            className="py-8 text-center border-2 border-dashed border-stone-200 dark:border-[#442918] rounded-xl cursor-pointer hover:border-stone-300 dark:hover:border-[#664433] transition-colors"
          >
            <p className="text-sm text-stone-400 dark:text-[#cc9a58]">
              No assignments or tasks added yet.
            </p>
            <p className="text-xs text-stone-300 dark:text-[#bb8c50] mt-1">
              Click to pick what you're working on today
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#553311] border border-[#e8ddd0] dark:border-[#442918] rounded-xl shadow-sm overflow-hidden divide-y divide-[#e8ddd0] dark:divide-[#442918]">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 group hover:bg-stone-50 dark:hover:bg-[#664433] transition-colors"
              >
                {/* Done toggle */}
                <button
                  onClick={() => handleToggle(item.id, item.type, item.done)}
                  className="shrink-0 hover:scale-110 transition-transform"
                  title={item.done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.done
                    ? <CheckCircle2 size={17} className="text-green-500" />
                    : <Circle size={17} className="text-stone-300" />
                  }
                </button>

                {/* Name */}
                <span className={cn(
                  'flex-1 text-sm truncate',
                  item.done
                    ? 'line-through text-stone-400 dark:text-[#cc9a58]'
                    : 'text-stone-800 dark:text-[#f0e0cc]'
                )}>
                  {item.name}
                </span>

                {/* Type icon */}
                <span className="shrink-0 hidden sm:flex items-center gap-1 text-xs text-stone-400 dark:text-[#c4a882]">
                  {item.type === 'assignment'
                    ? <BookOpen size={11} />
                    : <ListTodo size={11} />
                  }
                </span>

                {/* Course badge */}
                {item.courseName && (
                  <span
                    className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      backgroundColor: `${item.courseColor}1a`,
                      color: item.courseColor,
                    }}
                  >
                    {item.courseName}
                  </span>
                )}

                {/* Remove */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 p-1 text-stone-300 dark:text-[#775544] hover:text-stone-500 dark:hover:text-[#c4a882] transition-all"
                  title="Remove from focus list"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <StudyPickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

function MusicStudyColumn() {
  const { defaultMusicService } = useSettingsStore();

  if (!defaultMusicService) {
    return (
      <div className="w-full">
        <h2 className="text-xs font-semibold text-stone-500 dark:text-[#c4a882] uppercase tracking-wide mb-3">
          Music
        </h2>
        <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-stone-200 dark:border-[#442918] gap-3 text-center">
          <p className="text-sm text-stone-600 dark:text-[#d4b896] font-medium">No music service selected</p>
          <p className="text-xs text-stone-400 dark:text-[#c4a882]">Go to Settings to choose Spotify or Apple Music</p>
          <Link
            to="/settings"
            className="px-4 py-2 rounded-lg bg-[#e2a53b] text-[#1e1208] text-sm font-medium hover:bg-[#d49530] transition-colors"
          >
            Open Settings
          </Link>
        </div>
      </div>
    );
  }

  return defaultMusicService === 'spotify' ? <SpotifyStudyPanel /> : <AppleMusicStudyPanel />;
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

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => tick(), 1_000);
    return () => clearInterval(id);
  }, [isRunning, tick]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const color           = PHASE_COLORS[phase];
  const activeTechnique = TECHNIQUES.find(t => t.id === techniqueId)!;

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc] mb-8">Study</h1>

        <div className="flex flex-col lg:flex-row lg:gap-16 items-center lg:items-stretch">

          {/* ── Pomodoro / timer column ───────────────────────────────────────── */}
          <div className="flex flex-col items-center w-full max-w-sm shrink-0">

            {/* Technique selector */}
            <div className="w-full mb-6">
              <p className="text-xs font-semibold text-stone-400 dark:text-[#c4a882] uppercase tracking-wide mb-2">
                Technique
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TECHNIQUES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => applyTechnique(t)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-lg font-medium transition-colors',
                      techniqueId === t.id
                        ? 'bg-stone-800 dark:bg-[#664433] text-white dark:text-[#f0e0cc]'
                        : 'bg-stone-100 dark:bg-[#442918] border border-stone-300 dark:border-[#553311] text-stone-600 dark:text-[#d4b896] hover:bg-stone-200 dark:hover:bg-[#553311]'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {activeTechnique.id !== 'custom' && (
                <p className="mt-2 text-xs text-stone-400 dark:text-[#cc9a58] leading-relaxed">
                  {activeTechnique.desc}
                </p>
              )}
            </div>

            {/* Phase tabs */}
            <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#2d1a08] rounded-lg mb-8 self-stretch justify-center">
              {(Object.keys(PHASE_LABELS) as Phase[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPhase(p)}
                  className={cn(
                    'px-4 py-1.5 text-sm rounded-md transition-colors',
                    phase === p
                      ? 'bg-white dark:bg-[#664433] text-stone-800 dark:text-[#f0e0cc] shadow-sm font-medium'
                      : 'bg-stone-200/70 dark:bg-[#442918] text-stone-600 dark:text-[#c4a882] hover:bg-stone-200 dark:hover:bg-[#553311]'
                  )}
                >
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Progress ring */}
            <div className="relative flex items-center justify-center mb-8">
              <ProgressRing phase={phase} timeLeft={timeLeft} totalSecs={totalSecs} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-5xl lg:text-6xl font-semibold tabular-nums tracking-tight"
                  style={{ color }}
                >
                  {formatTime(timeLeft)}
                </span>
                <span className="text-xs text-stone-400 dark:text-[#c4a882] mt-1">
                  {PHASE_LABELS[phase]}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 mb-5">
              <button
                onClick={reset}
                title="Reset"
                className="p-2.5 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 dark:hover:bg-[#553311] transition-colors"
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
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-stone-500 dark:text-[#c4a882] mb-6">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={toggleAutoAdvance}
                className="accent-stone-600"
              />
              Auto-advance to next phase
            </label>

            {/* Custom duration pickers — only shown in Custom mode */}
            {techniqueId === 'custom' && (
              <div className="w-full space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-12 text-xs text-stone-400 dark:text-[#c4a882] shrink-0 text-right">Focus</span>
                  <div className="flex gap-1.5">
                    {FOCUS_OPTIONS.map(m => (
                      <button
                        key={m}
                        onClick={() => setFocusMins(m)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-md transition-colors',
                          focusMins === m
                            ? 'bg-stone-800 dark:bg-[#664433] text-white dark:text-[#f0e0cc] font-medium'
                            : 'bg-stone-100 dark:bg-[#442918] border border-stone-300 dark:border-[#553311] text-stone-600 dark:text-[#d4b896] hover:bg-stone-200 dark:hover:bg-[#553311]'
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-12 text-xs text-stone-400 dark:text-[#c4a882] shrink-0 text-right">Break</span>
                  <div className="flex gap-1.5">
                    {BREAK_OPTIONS.map(m => (
                      <button
                        key={m}
                        onClick={() => setBreakMins(m)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-md transition-colors',
                          breakMins === m
                            ? 'bg-stone-800 dark:bg-[#664433] text-white dark:text-[#f0e0cc] font-medium'
                            : 'bg-stone-100 dark:bg-[#442918] border border-stone-300 dark:border-[#553311] text-stone-600 dark:text-[#d4b896] hover:bg-stone-200 dark:hover:bg-[#553311]'
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Dividers ──────────────────────────────────────────────────────── */}
          <div className="w-full max-w-sm h-px bg-stone-200 dark:bg-[#442918] my-10 lg:hidden" />
          <div className="hidden lg:block w-px self-stretch bg-stone-200 dark:bg-[#442918] shrink-0" />

          {/* ── Music column ───────────────────────────────────────────────────── */}
          <div className="w-full max-w-md lg:flex-1 lg:max-w-xl lg:flex lg:flex-col">
            <MusicStudyColumn />
          </div>

        </div>

        {/* ── Focus list ────────────────────────────────────────────────────── */}
        <FocusListPanel />

      </div>
    </div>
  );
}
