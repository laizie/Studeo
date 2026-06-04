import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { Course } from '../../../shared/types';
import { useDeleteCourse } from '../../lib/queries/useCourses';

interface Props {
  course: Course;
}

export default function CourseCard({ course }: Props) {
  const deleteCourse = useDeleteCourse();

  function handleDelete(e: React.MouseEvent) {
    // Stop the click from bubbling up to the Link and navigating
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete "${course.name}"? This will also delete all its assignments.`)) {
      deleteCourse.mutate(course.id);
    }
  }

  return (
    <Link
      to={`/courses/${course.id}`}
      className="bg-white border border-stone-200 rounded-lg overflow-hidden flex items-center group hover:border-stone-300 hover:shadow-sm transition-all"
    >
      {/* Color accent bar */}
      <div className="w-1 self-stretch shrink-0" style={{ backgroundColor: course.color }} />

      {/* Name + abbreviation + building */}
      <div className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0">
        <span className="font-medium text-stone-800 truncate flex-1 group-hover:text-stone-900">
          {course.name}
        </span>

        <span
          className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: `${course.color}1a`,
            color: course.color,
          }}
        >
          {course.abbreviation}
        </span>

        {course.building && (
          <span className="text-sm text-stone-400 truncate hidden sm:block max-w-40">
            {course.building}
          </span>
        )}
      </div>

      {/* Delete — appears on hover */}
      <div className="px-3">
        <button
          onClick={handleDelete}
          disabled={deleteCourse.isPending}
          className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-red-500 rounded transition-all disabled:opacity-50"
          title="Delete course"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </Link>
  );
}
