import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Calendar,
  Timer,
} from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/courses', label: 'Courses', icon: BookOpen },
  { to: '/this-week', label: 'This Week', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/study', label: 'Study', icon: Timer },
];

export default function Sidebar() {
  return (
    <nav className="w-56 h-full flex flex-col bg-[#2c1f14] shrink-0">
      {/* App name */}
      <div className="px-4 py-5 border-b border-[#3d2b1f]">
        <span className="text-sm font-semibold text-[#e8d5c0] tracking-tight">
          ClassTrack
        </span>
      </div>

      {/* Navigation links */}
      <div className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm w-full transition-colors',
                isActive
                  ? 'bg-[#e2a53b] text-[#1e1208] font-semibold'
                  : 'text-[#c4a882] hover:bg-[#3d2b1f] hover:text-[#e8d5c0]'
              )
            }
          >
            <Icon size={15} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
