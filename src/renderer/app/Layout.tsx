import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import QuickAddDialog from '../features/quickadd/QuickAddDialog';
import CommandPalette from './CommandPalette';
import FocusMode from '../features/study/FocusMode';
import { useTimerDriver } from '../lib/useTimerDriver';
import { useReminderNavigation } from '../lib/useReminderNavigation';

export default function Layout() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  // Keep the Pomodoro timer running app-wide, independent of the current route.
  useTimerDriver();

  // Route the app when the user clicks a desktop reminder (main → renderer push).
  useReminderNavigation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full text-ink">
      <Sidebar onOpenQuickAdd={() => setQuickAddOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
      {/* Keyed by path so each navigation remounts (a) re-running the fade and
          (b) resetting scroll to the top. Kept as the scroll + full-height parent
          — a fade (opacity only) so page-rendered `fixed` dialogs still anchor to
          the viewport, unlike a transform would. */}
      <main key={location.pathname} className="animate-fade flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
      <QuickAddDialog isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <FocusMode />
    </div>
  );
}
