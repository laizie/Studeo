import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { Course } from '../../../shared/types';
import { useDeleteCourse } from '../../lib/queries/useCourses';

interface Props {
  course: Course;
  total?: number;
  completed?: number;
}

export default function CourseCard({ course, total = 0, completed = 0 }: Props) {
  const deleteCourse = useDeleteCourse();
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete "${course.name}"? This will also delete all its assignments.`)) {
      deleteCourse.mutate(course.id);
    }
  }

  return (
    <Link
      to={`/courses/${course.id}`}
      className="relative bg-white dark:bg-stone-800 border border-[#e8ddd0] dark:border-stone-700 rounded-xl overflow-hidden flex shadow-sm hover:shadow-md hover:border-[#d4c8b8] dark:hover:border-stone-600 transition-all group"
    >
      {/* Color accent bar */}
      <div className="w-1.5 shrink-0" style={{ backgroundColor: course.color }} />

      {/* Card body */}
      <div className="flex-1 p-5 min-w-0">
        {/* Name + abbreviation */}
        <div className="flex items-start justify-between gap-3 pr-5">
          <h3 className="font-semibold text-stone-800 dark:text-stone-100 truncate leading-snug group-hover:text-stone-900 dark:group-hover:text-white">
            {course.name}
          </h3>
          <span
            className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: `${course.color}2a`, color: course.color }}
          >
            {course.abbreviation}
          </span>
        </div>

        {/* Building */}
        {course.building && (
          <p className="mt-1 text-xs text-stone-400 dark:text-stone-500 truncate">{course.building}</p>
        )}

        {/* Progress */}
        <div className="mt-4">
          {total > 0 ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-stone-400 dark:text-stone-500">{completed} / {total} done</span>
                <span className="text-xs text-stone-400 dark:text-stone-500">{pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: course.color }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-stone-300 dark:text-stone-600">No assignments yet</p>
          )}
        </div>
      </div>

      {/* Delete — top-right, appears on hover */}
      <button
        onClick={handleDelete}
        disabled={deleteCourse.isPending}
        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1 text-stone-300 dark:text-stone-600 hover:text-red-500 rounded transition-all disabled:opacity-50"
        title="Delete course"
      >
        <Trash2 size={13} />
      </button>
    </Link>
  );
}
