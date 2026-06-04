import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import QuickAddDialog from '../features/quickadd/QuickAddDialog';

export default function Layout() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setQuickAddOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full text-stone-800 dark:text-[#f0e0cc]">
      <Sidebar onOpenQuickAdd={() => setQuickAddOpen(true)} />
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
      <QuickAddDialog isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}
