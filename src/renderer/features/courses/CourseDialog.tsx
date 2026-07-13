import { useState, useEffect, useRef, useId } from 'react';
import DialogShell from '../../components/DialogShell';
import { cn } from '../../lib/utils';
import { COURSE_COLORS, DEFAULT_COURSE_COLOR } from '../../lib/colors';
import { useCreateCourse, useUpdateCourse, useDeleteCourse, useRestoreCourse } from '../../lib/queries/useCourses';
import { useTerms } from '../../lib/queries/useTerms';
import type { Course } from '../../../shared/types';
import { INPUT_CLASS } from '../../lib/inputClass';
import { showUndoToast } from '../../store/useToastStore';
import { errorReason } from '../../lib/errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pass a course to edit it; omit to create a new one. */
  course?: Course;
}

// Turns "Introduction to Computer Science" → "ICS"
function deriveAbbreviation(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 4);
}


export default function CourseDialog({ isOpen, onClose, course }: Props) {
  const isEdit = course !== undefined;

  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  // Track whether user has manually edited abbreviation so we stop auto-deriving
  const [abbreviationEdited, setAbbreviationEdited] = useState(false);
  // Widened to string: an existing course's color comes from the DB as a plain
  // string, not necessarily one of the palette literals.
  const [color, setColor]   = useState<string>(DEFAULT_COURSE_COLOR);
  const [building, setBuilding] = useState('');
  const [termId, setTermId] = useState('');

  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const restoreCourse = useRestoreCourse();
  const mutation = isEdit ? updateCourse : createCourse;
  const { data: terms = [] } = useTerms();
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  // Two-step inline confirm for delete — no second modal stacked on this one.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Seed fields when the dialog opens: prefill from the course when editing,
  // otherwise start blank so a new course is always fresh.
  useEffect(() => {
    if (!isOpen) return;
    setConfirmingDelete(false);
    if (course) {
      setName(course.name);
      setAbbreviation(course.abbreviation);
      // Already has an abbreviation — don't auto-overwrite it when the name changes.
      setAbbreviationEdited(true);
      setColor(course.color);
      setBuilding(course.building ?? '');
      setTermId(course.term_id ?? '');
    } else {
      setName('');
      setAbbreviation('');
      setAbbreviationEdited(false);
      setColor(DEFAULT_COURSE_COLOR);
      setBuilding('');
      setTermId('');
    }
    // Small delay so the element is visible before we focus it
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, course]);

  function handleNameChange(value: string) {
    setName(value);
    if (!abbreviationEdited) {
      setAbbreviation(deriveAbbreviation(value));
    }
  }

  function handleAbbreviationChange(value: string) {
    setAbbreviation(value.toUpperCase().slice(0, 8));
    setAbbreviationEdited(true);
  }

  function handleDelete() {
    if (!course) return;
    deleteCourse.mutate(course.id, {
      onSuccess: (snapshot) => {
        setConfirmingDelete(false);
        onClose();
        showUndoToast(`Deleted “${course.name}”`, () => restoreCourse.mutate(snapshot));
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (course) {
      // Edit: send null (not undefined) for cleared optional fields so the
      // update path actually clears them.
      await updateCourse.mutateAsync({
        id: course.id,
        input: {
          name: name.trim(),
          abbreviation: abbreviation.trim() || deriveAbbreviation(name),
          color,
          building: building.trim() || null,
          termId: termId || null,
        },
      });
    } else {
      await createCourse.mutateAsync({
        name: name.trim(),
        abbreviation: abbreviation.trim() || deriveAbbreviation(name),
        color,
        building: building.trim() || undefined,
        termId: termId || undefined,
      });
    }

    onClose();
  }

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit course' : 'New course'}
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Course name */}
          <div>
            <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-ink-soft mb-1">
              Course name
            </label>
            <input
              id={`${uid}-name`}
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Introduction to Computer Science"
              className={INPUT_CLASS}
              required
            />
          </div>

          {/* Abbreviation */}
          <div>
            <label htmlFor={`${uid}-abbrev`} className="block text-sm font-medium text-ink-soft mb-1">
              Abbreviation
              <span className="ml-1 text-muted font-normal">(shown on cards)</span>
            </label>
            <input
              id={`${uid}-abbrev`}
              type="text"
              value={abbreviation}
              onChange={(e) => handleAbbreviationChange(e.target.value)}
              placeholder="e.g. CS101"
              className={INPUT_CLASS}
            />
          </div>

          {/* Color swatches — a radio group announcing human color names */}
          <div>
            <span className="block text-sm font-medium text-ink-soft mb-2">
              Color
            </span>
            <div role="radiogroup" aria-label="Course color" className="flex flex-wrap gap-2">
              {COURSE_COLORS.map(({ name: colorName, value }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={color === value}
                  aria-label={colorName}
                  onClick={() => setColor(value)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400',
                    color === value
                      ? 'border-stone-500 scale-125'
                      : 'border-transparent hover:scale-110'
                  )}
                  style={{ backgroundColor: value }}
                  title={colorName}
                />
              ))}
            </div>
          </div>

          {/* Building (optional) */}
          <div>
            <label htmlFor={`${uid}-building`} className="block text-sm font-medium text-ink-soft mb-1">
              Building
              <span className="ml-1 text-muted font-normal">(optional)</span>
            </label>
            <input
              id={`${uid}-building`}
              type="text"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="e.g. Engineering Hall 204"
              className={INPUT_CLASS}
            />
          </div>

          {/* Semester (optional — only shown when terms exist) */}
          {terms.length > 0 && (
            <div>
              <label htmlFor={`${uid}-term`} className="block text-sm font-medium text-ink-soft mb-1">
                Semester
                <span className="ml-1 text-muted font-normal">(optional)</span>
              </label>
              <select
                id={`${uid}-term`}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">— No semester —</option>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-600">
              {errorReason(mutation.error) ?? 'Something went wrong'} — your course wasn't saved. Please try again.
            </p>
          )}
          {deleteCourse.isError && (
            <p className="text-sm text-red-600">
              {errorReason(deleteCourse.error) ?? 'Something went wrong'} — the course wasn't deleted. Please try again.
            </p>
          )}

          {/* Actions. Editing adds a delete path on the left: a quiet text
              button that turns into an inline confirm — the real guardrail is
              the Undo toast after. */}
          <div className={cn('flex items-center gap-2 pt-1', isEdit ? 'justify-between' : 'justify-end')}>
            {isEdit && !confirmingDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="px-1 py-2 text-sm text-muted hover:text-red-600 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Delete course…
              </button>
            )}
            {isEdit && confirmingDelete && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-ink-soft truncate">
                  Delete its assignments and class times too?
                </span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteCourse.isPending}
                  className="shrink-0 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-300 dark:bg-red-950 dark:hover:bg-red-900 rounded-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  {deleteCourse.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="shrink-0 px-2 py-1.5 text-sm text-muted hover:text-ink-soft transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                >
                  Keep
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || mutation.isPending}
                className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {mutation.isPending
                  ? (isEdit ? 'Saving…' : 'Creating…')
                  : (isEdit ? 'Save changes' : 'Create course')}
              </button>
            </div>
          </div>
        </form>
    </DialogShell>
  );
}
