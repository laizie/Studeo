import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { useCourse } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import type { Assignment } from '../../../shared/types';
import { cn } from '../../lib/utils';
import AssignmentRow from './AssignmentRow';
import AddAssignmentDialog from './AddAssignmentDialog';

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

  const { data: course,      isLoading: courseLoading      } = useCourse(id ?? '');
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(
    id ? { courseId: id } : {}
  );

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
      <div className="p-8 max-w-3xl space-y-4 animate-pulse">
        <div className="h-4 w-24 bg-stone-100 rounded" />
        <div className="h-8 w-64 bg-stone-100 rounded" />
        <div className="h-px bg-stone-100 mt-6" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-stone-100 rounded-lg" />
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
        <Link to="/courses" className="mt-2 inline-block text-sm text-stone-400 underline hover:text-stone-600">
          ← Back to Courses
        </Link>
      </div>
    );
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-3xl">
      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600 transition-colors mb-6"
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
            <h1 className="text-2xl font-semibold text-stone-800 leading-tight">
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
            <p className="mt-1 text-sm text-stone-400">{course.building}</p>
          )}
        </div>
      </div>

      {/* Assignments header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-stone-700">Assignments</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Filter tabs — segmented control style */}
      <div className="flex items-center gap-1 mb-5 p-1 bg-stone-100 rounded-lg w-fit">
        {DUE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setDueFilter(f.value)}
            className={cn(
              'px-3 py-1 text-sm rounded-md transition-colors',
              dueFilter === f.value
                ? 'bg-white text-stone-800 shadow-sm font-medium'
                : 'text-stone-500 hover:text-stone-700'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Assignment list */}
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
              className="mt-3 text-sm text-stone-500 underline hover:text-stone-700 transition-colors"
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

      <AddAssignmentDialog
        courseId={course.id}
        assignment={editingAssignment}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
