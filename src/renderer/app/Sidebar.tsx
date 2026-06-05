import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, CalendarDays, CheckSquare,
  Calendar, Timer, Settings, Plus, Music,
} from 'lucide-react';
import { cn } from '../lib/utils';
import SpotifyMiniPlayer from '../features/spotify/SpotifyMiniPlayer';
import AppleMusicMiniPlayer from '../features/applemusic/AppleMusicMiniPlayer';
import { useSettingsStore } from '../store/useSettingsStore';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/courses', label: 'Courses', icon: BookOpen },
  { to: '/this-week', label: 'This Week', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/study', label: 'Study', icon: Timer },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm w-full transition-colors',
    isActive
      ? 'bg-[#e2a53b] text-[#1e1208] font-semibold'
      : 'text-[#c4a882] hover:bg-[#3d2b1f] hover:text-[#e8d5c0]',
  );

function MusicSection() {
  const { defaultMusicService } = useSettingsStore();

  if (!defaultMusicService) {
    return (
      <div className="border-t border-[#3d2b1f] dark:border-[#1e140c] px-3 py-2.5">
        <Link
          to="/settings"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[#c4a882] hover:bg-[#3d2b1f] hover:text-[#e8d5c0] transition-colors"
        >
          <Music size={13} className="shrink-0" />
          <span className="text-xs">Set up music in Settings</span>
        </Link>
      </div>
    );
  }

  return defaultMusicService === 'spotify'
    ? <SpotifyMiniPlayer />
    : <AppleMusicMiniPlayer />;
}

interface Props {
  onOpenQuickAdd: () => void;
}

export default function Sidebar({ onOpenQuickAdd }: Props) {
  return (
    <nav className="w-56 h-full flex flex-col bg-[#2c1f14] dark:bg-[#1c1008] shrink-0">
      <div className="px-4 py-5 border-b border-[#3d2b1f] dark:border-[#1e140c] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e8d5c0] tracking-tight">ClassTrack</span>
        <button
          onClick={onOpenQuickAdd}
          title="Quick add (⌘N)"
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#c4a882] hover:bg-[#3d2b1f] hover:text-[#e8d5c0] transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass}>
            <Icon size={15} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>

      <MusicSection />

      <div className="px-2 pb-3 border-t border-[#3d2b1f] dark:border-[#1e140c] pt-2">
        <NavLink to="/settings" className={navLinkClass}>
          <Settings size={15} className="shrink-0" />
          Settings
        </NavLink>
      </div>
    </nav>
  );
}
