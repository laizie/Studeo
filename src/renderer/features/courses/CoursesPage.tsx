import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Download, GraduationCap } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTermFilter } from '../../lib/useTermFilter';
import CourseCard from './CourseCard';
import { parseGradeSections, computeSectionStanding } from '../../../shared/grades';
import CourseDialog from './CourseDialog';
import QueryErrorState from '../../components/QueryErrorState';

export default function CoursesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: courses, isLoading, isError, refetch } = useCourses();
  const { data: assignments } = useAssignments();
  const { terms, termFilter, setTermFilter } = useTermFilter();

  const filtered = useMemo(() =>
    (courses ?? []).filter(c => termFilter === null || c.term_id === termFilter),
    [courses, termFilter],
  );

  const statsByCourse = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const c of filtered) map.set(c.id, { total: 0, completed: 0 });
    for (const a of assignments ?? []) {
      const s = map.get(a.course_id);
      if (!s) continue;
      s.total += 1;
      if (a.status === 'completed') s.completed += 1;
    }
    return map;
  }, [filtered, assignments]);

  const standingByCourse = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const c of filtered) {
      // Course grade comes from its custom grade sections.
      map.set(c.id, computeSectionStanding(parseGradeSections(c.grade_weights)).currentPercent);
    }
    return map;
  }, [filtered]);

  const count = filtered.length;

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Courses</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isLoading
              ? 'Loading…'
              : count > 0
              ? `${count} course${count !== 1 ? 's' : ''}`
              : 'Add your courses to get started'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/setup"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-line text-muted rounded-lg hover:bg-surface-hi transition-colors"
          >
            <GraduationCap size={15} />
            New semester
          </Link>
          <Link
            to="/import"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-line text-muted rounded-lg hover:bg-surface-hi transition-colors"
          >
            <Download size={15} />
            Import
          </Link>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] transition-colors"
          >
            <Plus size={15} />
            Add course
          </button>
        </div>
      </div>

      {/* Semester filter — only shown when terms exist */}
      {terms.length > 0 && (
        <div className="mb-6">
          <select
            value={termFilter ?? ''}
            onChange={e => setTermFilter(e.target.value || null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-line bg-surface text-ink-soft focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-surface-hi cursor-pointer"
          >
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="">All semesters</option>
          </select>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <QueryErrorState title="Couldn't load your courses" onRetry={() => refetch()} />
      )}

      {/* Empty state */}
      {!isLoading && !isError && count === 0 && (
        <div className="text-center py-24">
          <p className="text-muted text-sm">No courses yet.</p>
          <Link
            to="/setup"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] transition-colors"
          >
            <GraduationCap size={15} />
            Set up a semester
          </Link>
          <div>
            <button
              onClick={() => setIsDialogOpen(true)}
              className="mt-3 text-sm text-muted underline hover:text-ink transition-colors"
            >
              Or add a single course
            </button>
          </div>
        </div>
      )}

      {/* Course list */}
      {!isLoading && count > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(course => {
            const stats = statsByCourse.get(course.id) ?? { total: 0, completed: 0 };
            return (
              <CourseCard
                key={course.id}
                course={course}
                total={stats.total}
                completed={stats.completed}
                gradePercent={standingByCourse.get(course.id) ?? null}
              />
            );
          })}
        </div>
      )}

      <CourseDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </div>
  );
}
