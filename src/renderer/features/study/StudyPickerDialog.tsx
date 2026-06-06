import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import { useStudyListStore } from '../../store/useStudyListStore';
import type { Assignment, Task } from '../../../shared/types';
import { cn } from '../../lib/utils';

type Tab = 'assignments' | 'tasks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function StudyPickerDialog({ isOpen, onClose }: Props) {
  const [tab, setTab]       = useState<Tab>('assignments');
  const [search, setSearch] = useState('');

  const { data: courses     = [] } = useCourses();
  const { data: assignments = [] } = useAssignments();
  const { data: tasks       = [] } = useTasks();
  const { items, addItem, removeItem } = useStudyListStore();

  const courseMap = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const listIds   = useMemo(() => new Set(items.map(i => i.id)), [items]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => { if (isOpen) setSearch(''); }, [isOpen]);

  const q = search.toLowerCase();

  // Both lists sorted by due date only
  const pendingAssignments = useMemo(() =>
    assignments
      .filter(a => a.status !== 'completed' && (!q || a.name.toLowerCase().includes(q)))
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [assignments, q]
  );

  const pendingTasks = useMemo(() =>
    tasks
      .filter(t => t.status !== 'completed' && (!q || t.name.toLowerCase().includes(q)))
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [tasks, q]
  );

  function toggleAssignment(a: Assignment) {
    if (listIds.has(a.id)) {
      removeItem(a.id);
    } else {
      const course = courseMap.get(a.course_id);
      addItem({
        id: a.id,
        type: 'assignment',
        name: a.name,
        courseName:  course?.abbreviation || course?.name,
        courseColor: course?.color,
      });
    }
  }

  function toggleTask(t: Task) {
    if (listIds.has(t.id)) {
      removeItem(t.id);
    } else {
      addItem({ id: t.id, type: 'task', name: t.name });
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative bg-white dark:bg-[#553311] warm:bg-[#7e5a38] rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[72vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-stone-700 dark:text-[#e8d5c0]">
              Add to Focus List
            </h2>
            <p className="text-xs text-stone-400 dark:text-[#cc9a58] mt-0.5">
              {items.length} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 dark:text-[#e0b870] hover:text-stone-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300 dark:text-[#cc9a58]" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className={cn(
                'w-full pl-8 pr-3 py-2 text-sm rounded-lg',
                'border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30]',
                'bg-transparent dark:bg-[#332211] warm:bg-[#3d2918]',
                'text-stone-700 dark:text-[#f0e0cc]',
                'placeholder:text-stone-300 dark:placeholder:text-[#cc9a58]',
                'focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-[#664433]',
              )}
            />
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 px-5 pb-3 shrink-0">
          {(['assignments', 'tasks'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1 text-xs rounded-md capitalize transition-colors',
                tab === t
                  ? 'bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48] text-stone-700 dark:text-[#f0e0cc] font-medium'
                  : 'text-stone-400 dark:text-[#c4a882] hover:text-stone-600 dark:hover:text-[#e8d5c0]'
              )}
            >
              {t} ({t === 'assignments' ? pendingAssignments.length : pendingTasks.length})
            </button>
          ))}
        </div>

        {/* Scrollable list */}
        <div className="overflow-y-auto flex-1 px-3 pb-3">
          {tab === 'assignments' && (
            pendingAssignments.length === 0 ? (
              <p className="text-center text-sm text-stone-400 dark:text-[#cc9a58] py-10">
                {q ? 'No matches.' : 'All assignments are complete — nice!'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {pendingAssignments.map(a => {
                  const course = courseMap.get(a.course_id);
                  const inList = listIds.has(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAssignment(a)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                        inList
                          ? 'bg-amber-50 dark:bg-[#664433] warm:bg-[#8e6a48]'
                          : 'hover:bg-stone-50 dark:hover:bg-[#664433] warm:hover:bg-[#8e6a48]'
                      )}
                    >
                      <span className={cn(
                        'shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                        inList ? 'bg-[#e2a53b] border-[#e2a53b]' : 'border-stone-300 dark:border-[#775544] warm:border-[#9e7860]'
                      )}>
                        {inList && <Check size={9} strokeWidth={3} className="text-white" />}
                      </span>
                      <span className="flex-1 text-sm text-stone-700 dark:text-[#e8d5c0] truncate">
                        {a.name}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400 dark:text-[#cc9a58]">
                        {a.due_date}
                      </span>
                      {course && (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: `${course.color}1a`, color: course.color }}
                        >
                          {course.abbreviation}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}

          {tab === 'tasks' && (
            pendingTasks.length === 0 ? (
              <p className="text-center text-sm text-stone-400 dark:text-[#cc9a58] py-10">
                {q ? 'No matches.' : 'No pending tasks.'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {pendingTasks.map(t => {
                  const inList = listIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTask(t)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                        inList
                          ? 'bg-amber-50 dark:bg-[#664433] warm:bg-[#8e6a48]'
                          : 'hover:bg-stone-50 dark:hover:bg-[#664433] warm:hover:bg-[#8e6a48]'
                      )}
                    >
                      <span className={cn(
                        'shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                        inList ? 'bg-[#e2a53b] border-[#e2a53b]' : 'border-stone-300 dark:border-[#775544] warm:border-[#9e7860]'
                      )}>
                        {inList && <Check size={9} strokeWidth={3} className="text-white" />}
                      </span>
                      <span className="flex-1 text-sm text-stone-700 dark:text-[#e8d5c0] truncate">
                        {t.name}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400 dark:text-[#cc9a58]">
                        {t.due_date}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-100 dark:border-[#442918] warm:border-[#6e4c30] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] font-medium transition-colors"
          >
            Done ({items.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
}
