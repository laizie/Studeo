import { Link } from 'react-router-dom';
import type { Course } from '../../../shared/types';

interface Props {
  course: Course;
  total: number;
  completed: number;
}

export default function DashboardCourseCard({ course, total, completed }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="bg-white border border-stone-200 rounded-lg overflow-hidden flex hover:shadow-md transition-shadow group"
    >
      {/* Color accent bar */}
      <div className="w-1.5 shrink-0" style={{ backgroundColor: course.color }} />

      <div className="flex-1 p-5 min-w-0">
        {/* Top row: name + abbreviation pill */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-stone-800 truncate leading-snug group-hover:text-stone-900">
            {course.name}
          </h3>
          <span
            className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: `${course.color}1a`,
              color: course.color,
            }}
          >
            {course.abbreviation}
          </span>
        </div>

        {/* Building */}
        {course.building && (
          <p className="mt-1 text-xs text-stone-400 truncate">{course.building}</p>
        )}

        {/* Progress section */}
        <div className="mt-4">
          {total > 0 ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-stone-400">
                  {completed} / {total} done
                </span>
                <span className="text-xs text-stone-400">{pct}%</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: course.color,
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-stone-300">No assignments yet</p>
          )}
        </div>
      </div>
    </Link>
  );
}
