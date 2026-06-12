import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useCreateAssignment } from '../../lib/queries/useAssignments';
import { useCreateTask } from '../../lib/queries/useTasks';
import { ASSIGNMENT_TYPES, type AssignmentType } from '../../../shared/types';
import { cn } from '../../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'assignment' | 'task';

const INPUT =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'placeholder:text-stone-500 ' +
  'dark:bg-inset dark:border-line dark:text-ink dark:placeholder:text-muted dark:focus:ring-muted';

export default function QuickAddDialog({ isOpen, onClose }: Props) {
  // Remember the last-used tab across sessions (the Settings tip promises this).
  const [tab, setTab] = useState<Tab>(
    () => (localStorage.getItem('studeo:quickAddTab') === 'task' ? 'task' : 'assignment')
  );

  function selectTab(t: Tab) {
    localStorage.setItem('studeo:quickAddTab', t);
    setTab(t);
  }

  const [name, setName]       = useState('');
  const [type, setType]       = useState<AssignmentType>('Assignment');
  const [dueDate, setDueDate] = useState('');
  const [courseId, setCourseId] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);

  const { data: courses = [] } = useCourses();
  const createAssignment = useCreateAssignment();
  const createTask       = useCreateTask();

  // Reset form whenever the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setType('Assignment');
    setDueDate('');
    // Pre-select the first course if none selected yet
    setCourseId(prev => prev || (courses[0]?.id ?? ''));
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen]);

  // Keep courseId in sync if courses load after dialog opens
  useEffect(() => {
    if (!courseId && courses.length > 0) setCourseId(courses[0].id);
  }, [courses]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;

    if (tab === 'assignment') {
      if (!courseId) return;
      await createAssignment.mutateAsync({ courseId, name: name.trim(), type, dueDate });
    } else {
      await createTask.mutateAsync({ name: name.trim(), dueDate });
    }

    onClose();
  }

  const isPending = createAssignment.isPending || createTask.isPending;
  const isError   = createAssignment.isError   || createTask.isError;
  const canSubmit = name.trim() && dueDate && (tab === 'task' || courseId);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {/* Tab switcher */}
          <div className="flex items-center gap-0.5 p-0.5 bg-inset rounded-lg">
            {(['assignment', 'task'] as Tab[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => selectTab(t)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors capitalize',
                  tab === t
                    ? 'bg-white dark:bg-surface-hi text-ink shadow-sm font-medium'
                    : 'text-muted hover:text-stone-700 dark:hover:text-ink-soft'
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-stone-600 dark:hover:text-ink-soft transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Name */}
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={tab === 'assignment' ? 'Assignment name…' : 'Task name…'}
            className={INPUT}
            required
          />

          {/* Assignment-only fields */}
          {tab === 'assignment' && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                className={INPUT}
                required
              >
                {courses.length === 0
                  ? <option value="">No courses</option>
                  : courses.map(c => <option key={c.id} value={c.id}>{c.abbreviation || c.name}</option>)
                }
              </select>
              <select
                value={type}
                onChange={e => setType(e.target.value as AssignmentType)}
                className={INPUT}
              >
                {ASSIGNMENT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Due date */}
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className={INPUT}
            required
          />

          {isError && (
            <p className="text-xs text-red-500">Something went wrong — please try again.</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="flex-1 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isPending ? 'Saving…' : `Add ${tab}`}
            </button>
          </div>
        </form>

        <p className="mt-3 text-center text-[11px] text-muted">
          ⌘N to open · Esc to close
        </p>
      </div>
    </div>
  );
}
