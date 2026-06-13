import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';

/** The Notes front door: a notebook for each class, plus the Loose-notes bucket. */
export default function NotebooksLandingPage() {
  const { data: courses } = useCourses();
  const list = courses ?? [];

  return (
    <div className="p-8">
      <h1 className="mb-1 text-2xl font-semibold text-ink">Notes</h1>
      <p className="mb-6 text-sm text-muted">A notebook for each class. Press ⌘K to search across every note.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <Link
            key={c.id}
            to={`/notes/class/${c.id}`}
            className="rounded-xl border border-line bg-surface p-4 hover:bg-surface-hi transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{c.name}</p>
                <p className="text-xs text-muted">{c.abbreviation}</p>
              </div>
            </div>
          </Link>
        ))}

        <Link
          to="/notes/loose"
          className="flex items-center gap-2.5 rounded-xl border border-dashed border-line p-4 hover:bg-surface-hi transition-colors"
        >
          <FileText size={18} className="shrink-0 text-muted" />
          <div>
            <p className="font-medium text-ink">Loose notes</p>
            <p className="text-xs text-muted">Not tied to a class</p>
          </div>
        </Link>
      </div>

      {list.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Add a course to start a class notebook — or keep quick notes in Loose notes above.
        </p>
      )}
    </div>
  );
}
