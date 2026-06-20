import { useState, useMemo, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTerms } from '../../lib/queries/useTerms';
import { usePageFiltersStore } from '../../store/usePageFiltersStore';
import CourseCard from './CourseCard';
import { computeCourseStanding } from '../../../shared/grades';
import CourseDialog from './CourseDialog';
import QueryErrorState from '../../components/QueryErrorState';

export default function CoursesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: courses, isLoading, isError, refetch } = useCourses();
  const { data: assignments } = useAssignments();
  const { data: terms = [] } = useTerms();

  const termFilter    = usePageFiltersStore(s => s.termFilter);
  const setTermFilter = usePageFiltersStore(s => s.setTermFilter);

  // Auto-select the term whose date range contains today, once terms load
  useEffect(() => {
    if (termFilter !== null || terms.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = terms.find(t =>
      t.start_date && t.end_date && t.start_date <= today && today <= t.end_date
    );
    if (current) setTermFilter(current.id);
  }, [terms, termFilter, setTermFilter]);

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
      const courseAssignments = (assignments ?? []).filter(a => a.course_id === c.id);
      map.set(c.id, computeCourseStanding(courseAssignments, c.grade_weights).percent);
    }
    return map;
  }, [filtered, assignments]);

  const count = filtered.length;

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Courses</h1>
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
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep transition-colors"
        >
          <Plus size={15} />
          Add course
        </button>
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
          <p className="text-stone-500 text-sm">No courses yet.</p>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="mt-3 text-sm text-muted underline hover:text-stone-700 transition-colors"
          >
            Add your first course
          </button>
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
