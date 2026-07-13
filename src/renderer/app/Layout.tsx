import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import QuickAddDialog from '../features/quickadd/QuickAddDialog';
import CommandPalette from './CommandPalette';
import FocusMode from '../features/study/FocusMode';
import Toaster from '../components/Toaster';
import { useTimerDriver } from '../lib/useTimerDriver';
import { useReminderNavigation } from '../lib/useReminderNavigation';
import { useToastStore, showToast } from '../store/useToastStore';

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
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'n') {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key === 'z' && !e.shiftKey) {
        // ⌘Z takes back the last reversible action — the same takeback the toast
        // offers, reachable without leaving the keyboard. Skipped while typing:
        // inputs, textareas and the note editor own ⌘Z for their own text.
        const el = e.target as HTMLElement | null;
        if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (useToastStore.getState().undoLast()) {
          e.preventDefault();
          showToast('Undone');
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full text-ink">
      <Sidebar onOpenQuickAdd={() => setQuickAddOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
      {/* Keyed by path so each navigation remounts, which (a) replays the screen
          transition and (b) resets scroll to the top. Kept as the scroll +
          full-height parent. The transition's transform reverts the moment it
          finishes (backwards fill), so page-rendered `fixed` dialogs — opened
          well after it — still anchor to the viewport, not to <main>. */}
      <main key={location.pathname} className="animate-screen flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
      <QuickAddDialog isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onQuickAdd={() => setQuickAddOpen(true)}
      />
      <FocusMode />
      <Toaster />
    </div>
  );
}
