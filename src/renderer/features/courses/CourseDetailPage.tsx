import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Rows3 } from 'lucide-react';
import { useCourse } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useClassMeetings, useDeleteClassMeeting } from '../../lib/queries/useClassMeetings';
import type { Assignment, ClassMeeting } from '../../../shared/types';
import { cn } from '../../lib/utils';
import AssignmentRow from './AssignmentRow';
import AddAssignmentDialog from './AddAssignmentDialog';
import ClassMeetingDialog from './ClassMeetingDialog';

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
  const [dialogOpen, setDialogOpen]             = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | undefined>();
  const [meetingDialogOpen, setMeetingDialogOpen]       = useState(false);
  const [editingMeeting, setEditingMeeting]             = useState<ClassMeeting | undefined>();

  const { data: course,      isLoading: courseLoading      } = useCourse(id ?? '');
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(
    id ? { courseId: id } : {}
  );
  const { data: meetings } = useClassMeetings(id ? { courseId: id } : {});
  const deleteMeeting = useDeleteClassMeeting();

  const isLoading  = courseLoading || assignmentsLoading;
  const allAssignments = assignments ?? [];
  const filtered   = applyDueFilter(allAssignments, dueFilter);

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
        <div className="h-4 w-24 bg-stone-100 rounded" />
        <div className="h-8 w-64 bg-stone-100 rounded" />
        <div className="h-px bg-stone-100 mt-6" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-stone-100 dark:bg-[#553311] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!course) {
    return (
      <div className="p-8">
        <p className="text-sm text-stone-500">Course not found.</p>
        <Link to="/courses" className="mt-2 inline-block text-sm text-stone-400 dark:text-[#e0b870] underline hover:text-stone-600">
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
        className="inline-flex items-center gap-1.5 text-sm text-stone-400 dark:text-[#e0b870] hover:text-stone-600 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Courses
      </Link>

      {/* Course header */}
      <div className="flex items-start gap-3 mb-8">
        <div
          className="w-1 self-stretch rounded-full shrink-0 mt-1"
          style={{ backgroundColor: course.color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc] leading-tight">
              {course.name}
            </h1>
            <span
              className="inline-block px-2 py-0.5 rounded text-sm font-medium"
              style={{
                backgroundColor: `${course.color}1a`,
                color: course.color,
              }}
            >
              {course.abbreviation}
            </span>
          </div>
          {course.building && (
            <p className="mt-1 text-sm text-stone-400 dark:text-[#e0b870]">{course.building}</p>
          )}
        </div>
      </div>

      {/* Two-column layout at lg+: assignments left, schedule right */}
      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-10 lg:items-start">

        {/* ── Assignments ──────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-stone-700 dark:text-[#d4b896]">Assignments</h2>
            <div className="flex items-center gap-2">
              <Link
                to={`/courses/${id}/batch`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#e8ddd0] dark:border-[#442918] text-stone-600 dark:text-[#c4a882] rounded-lg hover:bg-stone-50 dark:hover:bg-[#553311] transition-colors"
              >
                <Rows3 size={14} />
                Batch add
              </Link>
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] transition-colors"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-5 p-1 bg-stone-100 dark:bg-[#553311] rounded-lg w-fit">
            {DUE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setDueFilter(f.value)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  dueFilter === f.value
                    ? 'bg-white dark:bg-[#664433] text-stone-800 dark:text-[#f0e0cc] shadow-sm font-medium'
                    : 'text-stone-500 dark:text-[#c4a882] hover:text-stone-700 dark:hover:text-[#e8d5c0]'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-stone-400 text-sm">
                {allAssignments.length === 0
                  ? 'No assignments yet.'
                  : 'No assignments in this window.'}
              </p>
              {allAssignments.length === 0 && (
                <button
                  onClick={openAdd}
                  className="mt-3 text-sm text-stone-500 dark:text-[#c4a882] underline hover:text-stone-700 transition-colors"
                >
                  Add first assignment
                </button>
              )}
            </div>
          ) : (
            <div className="-mx-3">
              {filtered.map(a => (
                <AssignmentRow key={a.id} assignment={a} onEdit={openEdit} />
              ))}
            </div>
          )}
        </div>

        {/* ── Class Schedule ───────────────────────────────────────────────── */}
        <div className="mt-10 lg:mt-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-stone-700">Class Schedule</h2>
            <button
              onClick={() => { setEditingMeeting(undefined); setMeetingDialogOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] transition-colors"
            >
              <Plus size={14} />
              Add time
            </button>
          </div>

          {(!meetings || meetings.length === 0) ? (
            <p className="text-sm text-stone-400 dark:text-[#e0b870] py-4">No class times yet.</p>
          ) : (
            <div className="-mx-3">
              {meetings.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 group hover:bg-stone-50 dark:hover:bg-[#553311] rounded-lg transition-colors"
                >
                  <span className="w-8 text-xs font-semibold text-stone-500 dark:text-[#c4a882] shrink-0">
                    {DAY_NAMES[m.day_of_week]}
                  </span>
                  <span className="flex-1 text-sm text-stone-700">
                    {formatTime(m.start_time)} – {formatTime(m.end_time)}
                  </span>
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingMeeting(m); setMeetingDialogOpen(true); }}
                      className="p-1 text-stone-400 dark:text-[#e0b870] hover:text-stone-600 rounded transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Remove this class time?')) deleteMeeting.mutate(m.id);
                      }}
                      disabled={deleteMeeting.isPending}
                      className="p-1 text-stone-400 dark:text-[#e0b870] hover:text-red-500 rounded transition-colors disabled:opacity-50"
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

      </div>

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
    </div>
  );
}
