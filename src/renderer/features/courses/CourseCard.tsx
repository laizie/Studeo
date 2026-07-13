import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { Course } from '../../../shared/types';
import { formatPercent } from '../../../shared/grades';
import { courseInk, coursePillBg } from '../../lib/colors';
import CourseDialog from './CourseDialog';

interface Props {
  course: Course;
  total?: number;
  completed?: number;
  /** Current weighted grade (0–100), or null when nothing is graded yet. */
  gradePercent?: number | null;
}

export default function CourseCard({ course, total = 0, completed = 0, gradePercent = null }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="relative bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md hover:border-line-strong transition-all group">
      {/* Color accent strip — 2px, per DESIGN.md's sanctioned top strip */}
      <div className="h-0.5 shrink-0 w-full" style={{ backgroundColor: course.color }} />

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
            style={{ backgroundColor: coursePillBg(course.color), color: courseInk(course.color) }}
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
                  style={{ color: courseInk(course.color) }}
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

      {/* Edit — top-right, revealed on hover or keyboard focus. `z-10` lifts it
          above the stretched link overlay so it stays clickable. (Delete lives
          inside the edit dialog — too destructive for a 13px hover target.) */}
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => setEditOpen(true)}
          aria-label={`Edit ${course.name}`}
          title="Edit course"
          className="p-1 rounded text-muted hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 transition-colors"
        >
          <Pencil size={13} />
        </button>
      </div>

      <CourseDialog
        course={course}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
