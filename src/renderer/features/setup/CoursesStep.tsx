import { useMemo, useRef, useState } from 'react';
import { Plus, X, ArrowLeft } from 'lucide-react';
import { useCourses, useCreateCourse, useDeleteCourse } from '../../lib/queries/useCourses';
import { COURSE_COLORS } from '../../lib/colors';
import { WIZARD_INPUT } from './constants';

interface Props {
  termId: string;
  onBack: () => void;
  onNext: () => void;
}

// "Introduction to Computer Science" → "ICS". Same rule as CourseDialog.
function deriveAbbreviation(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 4);
}

/** Step 2 — rapid-add the term's courses. Each Add writes immediately, so the
 *  list below is the real, saved set (and step 3 reads it back). */
export default function CoursesStep({ termId, onBack, onNext }: Props) {
  const { data: allCourses = [] } = useCourses();
  const createCourse = useCreateCourse();
  const deleteCourse = useDeleteCourse();

  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const courses = useMemo(
    () => allCourses.filter(c => c.term_id === termId),
    [allCourses, termId],
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || createCourse.isPending) return;
    // Cycle the palette so each course gets a distinct accent with zero fuss;
    // the user can recolor later in the course's edit dialog.
    const color = COURSE_COLORS[courses.length % COURSE_COLORS.length].value;
    try {
      await createCourse.mutateAsync({
        name: name.trim(),
        abbreviation: deriveAbbreviation(name),
        color,
        building: building.trim() || undefined,
        termId,
      });
    } catch {
      return; // createCourse.isError renders the message; keep the input
    }
    setName('');
    setBuilding('');
    nameRef.current?.focus();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Add your courses</h2>
        <p className="mt-1 text-sm text-muted">
          Type a name and press Enter — add them all in a row. Colors are assigned
          automatically; you can tweak anything later.
        </p>
      </div>

      {/* Added-so-far list */}
      {courses.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {courses.map(c => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="font-mono text-xs font-semibold text-muted">{c.abbreviation}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
              {c.building && <span className="truncate text-xs text-muted">{c.building}</span>}
              <button
                onClick={() => deleteCourse.mutate(c.id)}
                aria-label={`Remove ${c.name}`}
                className="rounded p-1 text-muted transition-colors hover:text-red-500"
                title="Remove"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add row */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          ref={nameRef}
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Course name"
          className={WIZARD_INPUT}
        />
        <input
          type="text"
          value={building}
          onChange={e => setBuilding(e.target.value)}
          placeholder="Building (optional)"
          className={`${WIZARD_INPUT} max-w-[11rem]`}
        />
        <button
          type="submit"
          disabled={!name.trim() || createCourse.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-hi px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} />
          Add
        </button>
      </form>

      {createCourse.isError && (
        <p className="text-sm text-red-600">Couldn't add that course — please try again.</p>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink-soft"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={courses.length === 0}
          className="rounded-lg bg-accent px-5 py-2 text-sm text-accent-ink transition-colors hover:bg-accent-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
