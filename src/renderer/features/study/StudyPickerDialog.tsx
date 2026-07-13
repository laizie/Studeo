import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useFocusTrap } from '../../lib/useFocusTrap';
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

  // Custom layout (pinned footer + inner scroll), so the a11y contract is
  // applied in place instead of through DialogShell.
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId  = useId();
  useFocusTrap(isOpen, panelRef);

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
      <div className="absolute inset-0 bg-black/30 animate-fade" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[72vh] animate-pop"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-ink-soft">
              Add to Focus List
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {items.length} selected
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className={cn(
                'w-full pl-8 pr-3 py-2 text-sm rounded-lg',
                'border border-line',
                'bg-transparent dark:bg-inset',
                'text-ink',
                'placeholder:text-muted',
                'focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-surface-hi',
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
                  ? 'bg-inset text-ink font-medium'
                  : 'text-muted hover:text-ink-soft'
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
              <p className="text-center text-sm text-muted py-10">
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
                          ? 'bg-amber-50 dark:bg-surface-hi'
                          : 'hover:bg-surface-hi'
                      )}
                    >
                      <span className={cn(
                        'shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                        inList ? 'bg-accent border-accent' : 'border-stone-300 dark:border-line'
                      )}>
                        {inList && <Check size={9} strokeWidth={3} className="text-white" />}
                      </span>
                      <span className="flex-1 text-sm text-ink-soft truncate">
                        {a.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {a.due_date}
                      </span>
                      {course && (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: `${course.color}40`, color: course.color }}
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
              <p className="text-center text-sm text-muted py-10">
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
                          ? 'bg-amber-50 dark:bg-surface-hi'
                          : 'hover:bg-surface-hi'
                      )}
                    >
                      <span className={cn(
                        'shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                        inList ? 'bg-accent border-accent' : 'border-stone-300 dark:border-line'
                      )}>
                        {inList && <Check size={9} strokeWidth={3} className="text-white" />}
                      </span>
                      <span className="flex-1 text-sm text-ink-soft truncate">
                        {t.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
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
        <div className="px-5 py-3 border-t border-line shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] font-medium transition-colors"
          >
            Done ({items.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
}
