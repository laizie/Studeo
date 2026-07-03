import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Download, LayoutDashboard, ListPlus, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useTerms } from '../../lib/queries/useTerms';

interface Props {
  termId: string;
  onBack: () => void;
}

/** Step 4 — the semester scaffold is built; hand off to the existing flows for
 *  filling in assignments (Canvas import or per-course batch entry). */
export default function DoneStep({ termId, onBack }: Props) {
  const { data: allCourses = [] } = useCourses();
  const { data: terms = [] } = useTerms();

  const term = terms.find(t => t.id === termId);
  const courses = useMemo(
    () => allCourses.filter(c => c.term_id === termId),
    [allCourses, termId],
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CheckCircle2 size={40} className="mx-auto text-accent" />
        <h2 className="mt-3 text-lg font-semibold text-ink">
          {term?.name ?? 'Your semester'} is set up
        </h2>
        <p className="mt-1 text-sm text-muted">
          {courses.length} course{courses.length !== 1 ? 's' : ''} added. Next, bring
          in the assignments — import a Canvas feed, or type them in per course.
        </p>
      </div>

      {/* Canvas import — the fastest path when a feed exists */}
      <Link
        to="/import"
        className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 transition-colors hover:bg-surface-hi"
      >
        <Download size={18} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Import from Canvas</p>
          <p className="text-xs text-muted">Pull assignments and due dates from a calendar feed URL.</p>
        </div>
      </Link>

      {/* Per-course batch entry */}
      {courses.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Or add assignments by hand
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {courses.map(c => (
              <li key={c.id}>
                <Link
                  to={`/courses/${c.id}/batch`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hi"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                  <ListPlus size={15} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink-soft"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm text-accent-ink transition-colors hover:bg-accent-deep"
        >
          <LayoutDashboard size={15} />
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
