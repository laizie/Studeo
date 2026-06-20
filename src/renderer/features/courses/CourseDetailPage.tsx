import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Rows3, CalendarOff } from 'lucide-react';
import { useCourse, useUpdateCourse } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useClassMeetings, useDeleteClassMeeting } from '../../lib/queries/useClassMeetings';
import { useTerms } from '../../lib/queries/useTerms';
import type { Assignment, ClassMeeting } from '../../../shared/types';
import { cn } from '../../lib/utils';
import AssignmentRow from './AssignmentRow';
import AddAssignmentDialog from './AddAssignmentDialog';
import CourseDialog from './CourseDialog';
import GradeWeightsCard from './GradeWeightsCard';
import EntityNotesList from '../notes/EntityNotesList';
import { computeCourseStanding, formatPercent } from '../../../shared/grades';
import ClassMeetingDialog from './ClassMeetingDialog';
import MeetingExceptionDialog from './MeetingExceptionDialog';
import QueryErrorState from '../../components/QueryErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

type DueFilter = '7' | '14' | '30' | 'all';

const DUE_FILTERS: { label: string; value: DueFilter }[] = [
  { label: '7 days',  value: '7'   },
  { label: '14 days', value: '14'  },
  { label: '30 days', value: '30'  },
  { label: 'All',     value: 'all' },
];

// Keep overdue items visible in every filtered view — students need to see them.
function applyDueFilter(assignments: Assignment[], filter: DueFilter): Assignment[] {
  if (filter === 'all') return assignments;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + parseInt(filter));
  return assignments.filter(a => new Date(a.due_date) <= cutoff);
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [dueFilter, setDueFilter]               = useState<DueFilter>('all');
  const [editCourseOpen, setEditCourseOpen]     = useState(false);
  const [dialogOpen, setDialogOpen]             = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | undefined>();
  const [meetingDialogOpen, setMeetingDialogOpen]       = useState(false);
  const [editingMeeting, setEditingMeeting]             = useState<ClassMeeting | undefined>();
  const [deletingMeetingId, setDeletingMeetingId]       = useState<string | null>(null);
  const [exceptionMeeting, setExceptionMeeting]         = useState<ClassMeeting | undefined>();

  const { data: course,      isLoading: courseLoading,      isError: courseError,      refetch: refetchCourse      } = useCourse(id ?? '');
  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, refetch: refetchAssignments } = useAssignments(
    id ? { courseId: id } : {}
  );
  const { data: meetings }    = useClassMeetings(id ? { courseId: id } : {});
  const { data: terms = [] }  = useTerms();
  const deleteMeeting  = useDeleteClassMeeting();
  const updateCourse   = useUpdateCourse();

  const isLoading  = courseLoading || assignmentsLoading;
  const allAssignments = assignments ?? [];
  const filtered   = applyDueFilter(allAssignments, dueFilter);
  // Derived, never stored: recomputed from scores + the course's weight scheme.
  const standing = computeCourseStanding(allAssignments, course?.grade_weights ?? null);

  function openAdd() {
    setEditingAssignment(undefined);
    setDialogOpen(true);
  }

  function openEdit(a: Assignment) {
    setEditingAssignment(a);
    setDialogOpen(true);
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-4 w-24 bg-surface rounded" />
        <div className="h-8 w-64 bg-surface rounded" />
        <div className="h-px bg-surface mt-6" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ── distinct from "not found": the course may exist but failed to load.
  if (courseError || assignmentsError) {
    return (
      <div className="p-8">
        <QueryErrorState
          title="Couldn't load this course"
          onRetry={() => { refetchCourse(); refetchAssignments(); }}
        />
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!course) {
    return (
      <div className="p-8">
        <p className="text-sm text-stone-500">Course not found.</p>
        <Link to="/courses" className="mt-2 inline-block text-sm text-muted underline hover:text-stone-600">
          ← Back to Courses
        </Link>
      </div>
    );
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-stone-600 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Courses
      </Link>

      {/* Course header */}
      <div className="flex items-start gap-3 mb-8">
        <div
          className="w-1.5 self-stretch rounded-full shrink-0 mt-1"
          style={{ backgroundColor: course.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-ink leading-tight">
              {course.name}
            </h1>
            <span
              className="inline-block px-2 py-0.5 rounded text-sm font-medium"
              style={{
                backgroundColor: `${course.color}40`,
                color: course.color,
              }}
            >
              {course.abbreviation}
            </span>
          </div>
          {course.building && (
            <p className="mt-1 text-sm text-muted">{course.building}</p>
          )}
          {standing.percent !== null && (
            <p className="mt-1 text-sm text-ink-soft">
              Current grade:{' '}
              <span className="font-semibold tabular-nums" style={{ color: course.color }}>
                {formatPercent(standing.percent)}
              </span>
              <span className="text-muted"> · {standing.gradedCount} graded</span>
            </p>
          )}
          {/* Semester selector — only shown when at least one term exists */}
          {terms.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted">Semester:</span>
              <select
                value={course.term_id ?? ''}
                onChange={e => updateCourse.mutate({
                  id: course.id,
                  input: { termId: e.target.value || null },
                })}
                className="text-xs px-2 py-1 rounded-md border border-line bg-transparent dark:bg-inset text-ink-soft focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-surface-hi cursor-pointer"
              >
                <option value="">— None —</option>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Edit course — name, abbreviation, color, building, semester */}
        <button
          onClick={() => setEditCourseOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm border border-line text-stone-600 dark:text-muted rounded-lg hover:bg-surface-hi transition-colors"
        >
          <Pencil size={14} />
          Edit
        </button>
      </div>

      {/* Two-column layout at lg+: assignments left, schedule right */}
      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-10 lg:items-start">

        {/* ── Assignments ──────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-soft">Assignments</h2>
            <div className="flex items-center gap-2">
              <Link
                to={`/courses/${id}/batch`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-line text-stone-600 dark:text-muted rounded-lg hover:bg-surface-hi transition-colors"
              >
                <Rows3 size={14} />
                Batch add
              </Link>
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep transition-colors"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-5 p-1 bg-inset rounded-lg w-fit">
            {DUE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setDueFilter(f.value)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  dueFilter === f.value
                    ? 'bg-surface text-ink shadow-sm font-medium'
                    : ' text-stone-600 dark:text-muted hover:bg-stone-200 dark:hover:bg-surface-hi'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-stone-500 text-sm">
                  {allAssignments.length === 0
                    ? 'No assignments yet.'
                    : 'No assignments in this window.'}
                </p>
                {allAssignments.length === 0 && (
                  <button
                    onClick={openAdd}
                    className="mt-3 text-sm text-muted underline hover:text-stone-700 transition-colors"
                  >
                    Add first assignment
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-line">
                {filtered.map(a => (
                  <AssignmentRow key={a.id} assignment={a} onEdit={openEdit} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Class Schedule ───────────────────────────────────────────────── */}
        <div className="mt-10 lg:mt-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-soft">Class Schedule</h2>
            <button
              onClick={() => { setEditingMeeting(undefined); setMeetingDialogOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep transition-colors"
            >
              <Plus size={14} />
              Add time
            </button>
          </div>

          <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
          {(!meetings || meetings.length === 0) ? (
            <p className="text-sm text-muted py-4 px-4">No class times yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {meetings.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 group hover:bg-surface-hi rounded-lg transition-colors"
                >
                  <span className="w-8 text-xs font-semibold text-muted shrink-0">
                    {DAY_NAMES[m.day_of_week]}
                  </span>
                  <span className="flex-1 text-sm text-ink-soft">
                    {formatTime(m.start_time)} – {formatTime(m.end_time)}
                  </span>
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => setExceptionMeeting(m)}
                      aria-label={`Cancel or move a ${DAY_NAMES[m.day_of_week]} class date`}
                      className="p-1 text-muted hover:text-stone-600 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                      title="Cancel or move a date"
                    >
                      <CalendarOff size={13} />
                    </button>
                    <button
                      onClick={() => { setEditingMeeting(m); setMeetingDialogOpen(true); }}
                      aria-label={`Edit ${DAY_NAMES[m.day_of_week]} class time`}
                      className="p-1 text-muted hover:text-stone-600 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeletingMeetingId(m.id)}
                      disabled={deleteMeeting.isPending}
                      aria-label={`Remove ${DAY_NAMES[m.day_of_week]} class time`}
                      className="p-1 text-muted hover:text-red-500 rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>

          <GradeWeightsCard course={course} />
        </div>

      </div>

      {/* ── Notes (course knowledge base) ──────────────────────────────────── */}
      <div className="mt-12">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-semibold text-ink-soft">Notes</span>
          <Link
            to={`/notes/class/${course.id}`}
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Open notebook →
          </Link>
        </div>
        <EntityNotesList
          entityType="course"
          entityId={course.id}
          newNoteTitle={`${course.abbreviation} — `}
          heading=""
        />
      </div>

      <CourseDialog
        course={course}
        isOpen={editCourseOpen}
        onClose={() => setEditCourseOpen(false)}
      />
      <AddAssignmentDialog
        courseId={course.id}
        assignment={editingAssignment}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <ClassMeetingDialog
        courseId={course.id}
        meeting={editingMeeting}
        isOpen={meetingDialogOpen}
        onClose={() => setMeetingDialogOpen(false)}
      />
      <MeetingExceptionDialog
        meeting={exceptionMeeting}
        isOpen={exceptionMeeting !== undefined}
        onClose={() => setExceptionMeeting(undefined)}
      />
      <ConfirmDialog
        isOpen={deletingMeetingId !== null}
        title="Remove this class time?"
        confirmLabel="Remove"
        onConfirm={() => { if (deletingMeetingId) deleteMeeting.mutate(deletingMeetingId); }}
        onClose={() => setDeletingMeetingId(null)}
      />
    </div>
  );
}
