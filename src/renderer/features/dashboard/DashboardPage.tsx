import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import DashboardCourseCard from './DashboardCourseCard';
import CreateCourseDialog from '../courses/CreateCourseDialog';

export default function DashboardPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: courses, isLoading: coursesLoading, isError: coursesError } = useCourses();
  // Fetch all assignments at once — we'll compute per-course counts from this list
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();

  const isLoading = coursesLoading || assignmentsLoading;
  const courseCount = courses?.length ?? 0;

  // Build a lookup: course_id → { total, completed }
  // This derived computation is intentionally not stored — it's always fresh from the data
  const statsByCourse = new Map<string, { total: number; completed: number }>();
  if (courses && assignments) {
    for (const course of courses) {
      statsByCourse.set(course.id, { total: 0, completed: 0 });
    }
    for (const a of assignments) {
      const stats = statsByCourse.get(a.course_id);
      if (!stats) continue;
      stats.total += 1;
      if (a.status === 'completed') stats.completed += 1;
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Dashboard</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {isLoading
              ? 'Loading…'
              : courseCount > 0
              ? `${courseCount} course${courseCount !== 1 ? 's' : ''} this semester`
              : 'Your courses and upcoming work at a glance'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-stone-100 rounded-lg h-32 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {coursesError && (
        <p className="text-sm text-red-500">
          Failed to load courses. Restart the app and try again.
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !coursesError && courseCount === 0 && (
        <div className="text-center py-24">
          <p className="text-stone-400 text-sm">No courses yet.</p>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="mt-3 text-sm text-stone-500 underline hover:text-stone-700 transition-colors"
          >
            Add your first course
          </button>
        </div>
      )}

      {/* Course grid */}
      {!isLoading && courseCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(courses ?? []).map(course => {
            const stats = statsByCourse.get(course.id) ?? { total: 0, completed: 0 };
            return (
              <DashboardCourseCard
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
