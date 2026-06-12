import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { Course } from '../../../shared/types';
import { useDeleteCourse } from '../../lib/queries/useCourses';
import { formatPercent } from '../../../shared/grades';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Props {
  course: Course;
  total?: number;
  completed?: number;
  /** Current weighted grade (0–100), or null when nothing is graded yet. */
  gradePercent?: number | null;
}

export default function CourseCard({ course, total = 0, completed = 0, gradePercent = null }: Props) {
  const deleteCourse = useDeleteCourse();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="relative bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md hover:border-[#d4c8b8] dark:hover:border-line transition-all group">
      {/* Color accent strip */}
      <div className="h-2 shrink-0 w-full" style={{ backgroundColor: course.color }} />

      {/* Card body */}
      <div className="flex-1 p-5 min-w-0">
        {/* Name + abbreviation. Stretched link: the whole card navigates, but the
            link stays a sibling of the delete button — no button-inside-anchor. */}
        <div className="flex items-start justify-between gap-3 pr-5">
          <h3 className="font-semibold truncate leading-snug">
            <Link
              to={`/courses/${course.id}`}
              className="text-ink group-hover:text-stone-900 dark:group-hover:text-white after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-stone-400"
            >
              {course.name}
            </Link>
          </h3>
          <span
            className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: `${course.color}40`, color: course.color }}
          >
            {course.abbreviation}
          </span>
        </div>

        {/* Building · current grade */}
        {(course.building || gradePercent !== null) && (
          <p className="mt-1 text-xs text-muted truncate">
            {course.building}
            {course.building && gradePercent !== null && ' · '}
            {gradePercent !== null && (
              <span className="font-medium text-ink-soft">
                Grade: {formatPercent(gradePercent)}
              </span>
            )}
          </p>
        )}

        {/* Progress */}
        <div className="mt-4">
          {total > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted">{completed} / {total} done</span>
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{ color: course.color }}
                >
                  {pct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-stone-200 dark:bg-surface-hi rounded-full">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: course.color }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted">No assignments yet</p>
          )}
        </div>
      </div>

      {/* Delete — top-right, revealed on hover or keyboard focus. `relative` lifts
          it above the stretched link overlay so it stays clickable. */}
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={deleteCourse.isPending}
        aria-label={`Delete ${course.name}`}
        title="Delete course"
        className="absolute top-2.5 right-2.5 z-10 p-1 rounded text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-all disabled:opacity-50"
      >
        <Trash2 size={13} />
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Delete "${course.name}"?`}
        message="This will also delete all of its assignments and class times."
        onConfirm={() => deleteCourse.mutate(course.id)}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
