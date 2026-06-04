import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import CourseCard from './CourseCard';
import CreateCourseDialog from './CreateCourseDialog';

export default function CoursesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: courses, isLoading, isError } = useCourses();
  const { data: assignments } = useAssignments();

  const statsByCourse = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const c of courses ?? []) map.set(c.id, { total: 0, completed: 0 });
    for (const a of assignments ?? []) {
      const s = map.get(a.course_id);
      if (!s) continue;
      s.total += 1;
      if (a.status === 'completed') s.completed += 1;
    }
    return map;
  }, [courses, assignments]);

  const count = courses?.length ?? 0;

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100">Courses</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {isLoading
              ? 'Loading…'
              : count > 0
              ? `${count} course${count !== 1 ? 's' : ''}`
              : 'Add your courses to get started'}
          </p>
        </div>

        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={15} />
          Add course
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-stone-100 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <p className="text-sm text-red-500">
          Failed to load courses. Restart the app and try again.
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && count === 0 && (
        <div className="text-center py-24">
          <p className="text-stone-400 text-sm">No courses yet.</p>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="mt-3 text-sm text-stone-500 dark:text-stone-400 underline hover:text-stone-700 transition-colors"
          >
            Add your first course
          </button>
        </div>
      )}

      {/* Course list */}
      {!isLoading && count > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(courses ?? []).map(course => {
            const stats = statsByCourse.get(course.id) ?? { total: 0, completed: 0 };
            return (
              <CourseCard
                key={course.id}
                course={course}
                total={stats.total}
                completed={stats.completed}
              />
            );
          })}
        </div>
      )}

      <CreateCourseDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </div>
  );
}
