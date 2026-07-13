import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, NotebookPen } from 'lucide-react';
import { format } from 'date-fns';
import { useCourses } from '../../lib/queries/useCourses';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useCreateAssignment, useDeleteAssignment } from '../../lib/queries/useAssignments';
import { useCreateTask, useDeleteTask } from '../../lib/queries/useTasks';
import { showUndoToast } from '../../store/useToastStore';
import { useCreateNote } from '../../lib/queries/useNotes';
import { useCreateLectureNote } from '../notes/useLectureNote';
import { findActiveOrNextSession } from '../../../shared/notebook';
import { parseDateLocal } from '../../../shared/deadlines';
import { parseQuickAdd } from '../../../shared/quickParse';
import { ASSIGNMENT_TYPES, type AssignmentType } from '../../../shared/types';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { cn } from '../../lib/utils';
import { INPUT_CLASS as INPUT } from '../../lib/inputClass';
import { errorReason } from '../../lib/errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'assignment' | 'task' | 'note';


export default function QuickAddDialog({ isOpen, onClose }: Props) {
  // Remember the last-used tab across sessions (the Settings tip promises this).
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('studeo:quickAddTab');
    return saved === 'task' || saved === 'note' ? saved : 'assignment';
  });

  function selectTab(t: Tab) {
    localStorage.setItem('studeo:quickAddTab', t);
    setTab(t);
  }

  const [name, setName]       = useState('');
  const [type, setType]       = useState<AssignmentType>('Assignment');
  const [dueDate, setDueDate] = useState('');
  const [courseId, setCourseId] = useState('');

  // Once the user hand-picks a field, stop letting the parser overwrite it — the
  // same "don't fight the user" pattern as CourseDialog's abbreviation-edited flag.
  const [courseTouched, setCourseTouched] = useState(false);
  const [typeTouched, setTypeTouched]     = useState(false);
  const [dateTouched, setDateTouched]     = useState(false);

  const nameRef  = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, panelRef);

  const navigate = useNavigate();
  const { data: courses = [] } = useCourses();
  const { data: meetings = [] } = useClassMeetings();
  const createAssignment = useCreateAssignment();
  const createTask       = useCreateTask();
  const deleteAssignment = useDeleteAssignment();
  const deleteTask       = useDeleteTask();
  const createNote       = useCreateNote();
  const createLectureNote = useCreateLectureNote();

  // For the Note tab: the class happening now or next, for one-tap lecture capture.
  const nextSession = isOpen && tab === 'note' ? findActiveOrNextSession(meetings, new Date()) : null;

  // Natural-language parse of the typed line ("phys quiz 2 fri", "laundry sat").
  // Recomputed as the user types; drives the live preview and auto-fills the
  // fields below. Tasks parse dates too — they just skip course/type matching.
  const parsed = useMemo(
    () => (tab !== 'note' && name.trim()
      ? parseQuickAdd(
          name,
          tab === 'assignment' ? courses.map(c => ({ id: c.id, name: c.name, abbreviation: c.abbreviation })) : [],
          new Date(),
        )
      : null),
    [tab, name, courses],
  );

  // Apply the parse to any field the user hasn't overridden yet.
  useEffect(() => {
    if (!parsed) return;
    if (tab === 'assignment') {
      if (parsed.courseId && !courseTouched) setCourseId(parsed.courseId);
      if (!typeTouched) setType(parsed.type);
    }
    if (parsed.dueDate && !dateTouched) setDueDate(parsed.dueDate);
  }, [parsed, tab, courseTouched, typeTouched, dateTouched]);

  // What we'll actually save: the cleaned name (date/course words stripped),
  // falling back to the raw text if the parser stripped everything.
  const cleanName = (parsed?.name || name).trim();

  async function captureLecture() {
    if (!nextSession) return;
    const abbrev = courses.find((c) => c.id === nextSession.courseId)?.abbreviation ?? '';
    const id = await createLectureNote({
      courseId: nextSession.courseId,
      courseAbbrev: abbrev,
      meetingId: nextSession.meetingId,
      date: nextSession.date,
    });
    onClose();
    navigate(`/notes/${id}`);
  }

  // Reset form whenever the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setType('Assignment');
    setDueDate('');
    setCourseTouched(false);
    setTypeTouched(false);
    setDateTouched(false);
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

  // Clear the line but keep the dialog open, so a burst of items is one ⌘N and
  // a rhythm of ⌘↵ — not ⌘N three times. Course/type/date persist deliberately:
  // the next item in a burst is usually for the same class.
  function resetForNext() {
    setName('');
    nameRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent, opts?: { stay?: boolean }) {
    e.preventDefault();
    if (!name.trim()) return;
    if (tab !== 'note' && !dueDate) return;

    // Confirm-with-takeback: the dialog closes silently, so the toast is the
    // proof it saved — and its Undo deletes the row we just created.
    if (tab === 'assignment') {
      if (!courseId || !cleanName) return;
      const created = await createAssignment.mutateAsync({ courseId, name: cleanName, type, dueDate });
      const abbrev = courses.find(c => c.id === courseId)?.abbreviation;
      showUndoToast(
        `Added “${cleanName}”${abbrev ? ` to ${abbrev}` : ''} · ${format(parseDateLocal(dueDate), 'EEE, MMM d')}`,
        () => deleteAssignment.mutate(created.id),
      );
    } else if (tab === 'task') {
      const created = await createTask.mutateAsync({ name: cleanName, dueDate });
      showUndoToast(
        `Added “${cleanName}” · ${format(parseDateLocal(dueDate), 'EEE, MMM d')}`,
        () => deleteTask.mutate(created.id),
      );
    } else {
      // A note opens straight into the editor — no due date, and nothing to
      // stay for.
      const note = await createNote.mutateAsync({ title: name.trim() });
      onClose();
      navigate(`/notes/${note.id}`);
      return;
    }

    if (opts?.stay) resetForNext();
    else onClose();
  }

  const isPending = createAssignment.isPending || createTask.isPending || createNote.isPending;
  const isError   = createAssignment.isError   || createTask.isError   || createNote.isError;
  const mutationError = createAssignment.error ?? createTask.error ?? createNote.error;
  const canSubmit = name.trim()
    && (tab === 'note' || (dueDate && cleanName))
    && (tab !== 'assignment' || courseId);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick add"
        className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5 animate-pop"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {/* Tab switcher */}
          <div className="flex items-center gap-0.5 p-0.5 bg-inset rounded-lg">
            {(['assignment', 'task', 'note'] as Tab[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => selectTab(t)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors capitalize',
                  tab === t
                    ? 'bg-surface dark:bg-surface-hi text-ink shadow-sm font-medium'
                    : 'text-muted hover:text-ink-soft'
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink-soft transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            // ⌘↵ / Ctrl+↵ — save and stay for the next one.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit && !isPending && tab !== 'note') {
              handleSubmit(e, { stay: true });
            }
          }}
          className="space-y-3"
        >
          {/* Smart capture: jump straight into lecture notes for the current/next class */}
          {tab === 'note' && nextSession && (
            <button
              type="button"
              onClick={captureLecture}
              className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-inset px-3 py-2 text-left hover:bg-surface-hi transition-colors"
            >
              <NotebookPen size={15} className="shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {nextSession.active ? 'In class now' : 'Next class'} · {courses.find((c) => c.id === nextSession.courseId)?.abbreviation ?? 'Class'}
                </span>
                <span className="block text-xs text-muted">
                  Take lecture notes · {format(parseDateLocal(nextSession.date), 'EEE, MMM d')} →
                </span>
              </span>
            </button>
          )}

          {/* Name */}
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={tab === 'assignment' ? 'e.g. phys quiz 2 fri' : tab === 'task' ? 'e.g. laundry sat' : 'Note title…'}
            className={INPUT}
            required
          />

          {/* Live parse preview — mirrors exactly what will be saved */}
          {tab !== 'note' && name.trim() && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted">Saving</span>
              <span className="font-medium text-ink">“{cleanName || '…'}”</span>
              {tab === 'assignment' && courseId && (
                <span className="rounded-full bg-inset px-2 py-0.5 text-ink-soft">
                  {courses.find(c => c.id === courseId)?.abbreviation ?? 'Course'}
                </span>
              )}
              {tab === 'assignment' && (
                <span className="rounded-full bg-inset px-2 py-0.5 text-ink-soft">{type}</span>
              )}
              {dueDate && (
                <span className="rounded-full bg-inset px-2 py-0.5 text-ink-soft">
                  {format(parseDateLocal(dueDate), 'EEE, MMM d')}
                </span>
              )}
            </div>
          )}

          {/* Assignment-only fields */}
          {tab === 'assignment' && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={courseId}
                onChange={e => { setCourseTouched(true); setCourseId(e.target.value); }}
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
                onChange={e => { setTypeTouched(true); setType(e.target.value as AssignmentType); }}
                className={INPUT}
              >
                {ASSIGNMENT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Due date — not applicable to a note */}
          {tab !== 'note' && (
            <input
              type="date"
              value={dueDate}
              onChange={e => { setDateTouched(true); setDueDate(e.target.value); }}
              className={INPUT}
              required
            />
          )}

          {isError && (
            <p className="text-xs text-red-500">{errorReason(mutationError) ?? 'Something went wrong'} — please try again.</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="flex-1 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isPending ? 'Saving…' : `Add ${tab}`}
            </button>
          </div>
        </form>

        <p className="mt-3 text-center text-xs text-muted">
          {tab === 'note'
            ? '⌘N to open · Esc to close'
            : '↵ add · ⌘↵ add another · Esc to close'}
        </p>
      </div>
    </div>
  );
}
