import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import QuickAddDialog from '../features/quickadd/QuickAddDialog';
import CommandPalette from './CommandPalette';
import FocusMode from '../features/study/FocusMode';
import { useTimerDriver } from '../lib/useTimerDriver';

export default function Layout() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Keep the Pomodoro timer running app-wide, independent of the current route.
  useTimerDriver();

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
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
      <QuickAddDialog isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <FocusMode />
    </div>
  );
}
