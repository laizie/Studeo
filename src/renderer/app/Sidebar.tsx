import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import logoUrl from '../assets/logo.png';
import {
  LayoutDashboard, BookOpen, CalendarDays, CheckSquare,
  Calendar, Timer, Settings, Plus, Music, FileText, Search,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import { useCourses } from '../lib/queries/useCourses';
import { cn } from '../lib/utils';
import SpotifyMiniPlayer from '../features/spotify/SpotifyMiniPlayer';
import AppleMusicMiniPlayer from '../features/applemusic/AppleMusicMiniPlayer';
import AutoNowPlaying from '../features/music/AutoNowPlaying';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTimerStore, PHASE_LABELS, PHASE_COLORS, formatClock } from '../store/useTimerStore';

// Three small clusters instead of one long list: planning views, the things
// being tracked, and the doing. Weekly Review isn't pinned here — it's a
// once-a-week ritual, reached from This Week, the Dashboard's weekend nudge,
// or ⌘K.
const navPlan = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/this-week', label: 'This Week', icon: CalendarDays },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
];

const navCollections = [
  { to: '/courses', label: 'Courses', icon: BookOpen },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
];

const navStudy = [
  { to: '/study', label: 'Study', icon: Timer },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm w-full transition-all active:scale-[0.98]',
    isActive
      ? 'bg-accent text-accent-ink font-semibold'
      : 'text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink',
  );

const subLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 px-2 py-1 rounded-md text-xs w-full transition-all active:scale-[0.98]',
    isActive
      ? 'bg-sidebar-line text-sidebar-ink font-medium'
      : 'text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink',
  );

/** "Notes" nav as a class-first group: a notebook per course + a Loose-notes bucket. */
function NotesNavSection() {
  const { data: courses } = useCourses();
  const [open, setOpen] = useState(true);
  const list = courses ?? [];

  return (
    <div>
      <div className="flex items-center">
        <NavLink to="/notes" end className={navLinkClass}>
          <FileText size={15} className="shrink-0" />
          Notes
        </NavLink>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse notebooks' : 'Expand notebooks'}
          className="ml-1 rounded-md p-1 text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink transition-colors"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {open && (
        <div className="ml-3.5 mt-0.5 space-y-0.5 border-l border-sidebar-line pl-2">
          {list.map((c) => (
            <NavLink key={c.id} to={`/notes/class/${c.id}`} className={subLinkClass}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="truncate">{c.abbreviation || c.name}</span>
            </NavLink>
          ))}
          <NavLink to="/notes/loose" className={subLinkClass}>
            <FileText size={12} className="shrink-0" />
            Loose notes
          </NavLink>
        </div>
      )}
    </div>
  );
}

/** Compact running-timer chip — visible from any screen, click to jump to Study. */
function TimerChip() {
  const isRunning = useTimerStore(s => s.isRunning);
  const timeLeft  = useTimerStore(s => s.timeLeft);
  const phase     = useTimerStore(s => s.phase);

  if (!isRunning) return null;

  return (
    <Link
      to="/study"
      className="animate-rise mx-2 mb-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sidebar-line hover:bg-sidebar-hover transition-colors"
      title="Go to Study"
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: PHASE_COLORS[phase] }}
        aria-hidden="true"
      />
      <span className="text-xs font-medium tabular-nums text-sidebar-ink">{formatClock(timeLeft)}</span>
      <span className="text-xs text-sidebar-muted truncate">{PHASE_LABELS[phase]}</span>
    </Link>
  );
}

function MusicSection() {
  const { musicMode } = useSettingsStore();

  if (!musicMode) {
    return (
      <div className="border-t border-sidebar-line px-3 py-2.5">
        <Link
          to="/settings"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink transition-colors"
        >
          <Music size={13} className="shrink-0" />
          <span className="text-xs">Set up music in Settings</span>
        </Link>
      </div>
    );
  }

  if (musicMode === 'spotify')     return <SpotifyMiniPlayer />;
  if (musicMode === 'apple_music') return <AppleMusicMiniPlayer />;
  return (
    <div className="border-t border-sidebar-line">
      <AutoNowPlaying />
    </div>
  );
}

interface Props {
  onOpenQuickAdd: () => void;
  onOpenSearch: () => void;
}

export default function Sidebar({ onOpenQuickAdd, onOpenSearch }: Props) {
  return (
    <nav className="w-56 h-full flex flex-col bg-sidebar shrink-0">
      <div className="px-4 py-5 border-b border-sidebar-line flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <span className="text-sm font-semibold text-sidebar-ink tracking-tight">Studeo</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onOpenSearch}
            title="Search (⌘K)"
            className="w-6 h-6 flex items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink transition-colors"
          >
            <Search size={14} />
          </button>
          <button
            onClick={onOpenQuickAdd}
            title="Quick add (⌘N)"
            className="w-6 h-6 flex items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-line hover:text-sidebar-ink transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navPlan.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass}>
            <Icon size={15} className="shrink-0" />
            {label}
          </NavLink>
        ))}
        <div className="my-2 border-t border-sidebar-line" aria-hidden="true" />
        {navCollections.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon size={15} className="shrink-0" />
            {label}
          </NavLink>
        ))}
        <NotesNavSection />
        <div className="my-2 border-t border-sidebar-line" aria-hidden="true" />
        {navStudy.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon size={15} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>

      <TimerChip />

      <MusicSection />

      <div className="px-2 pb-3 border-t border-sidebar-line pt-2">
        <NavLink to="/settings" className={navLinkClass}>
          <Settings size={15} className="shrink-0" />
          Settings
        </NavLink>
      </div>
    </nav>
  );
}
