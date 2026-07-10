import { useState, useEffect, useRef } from 'react';
import { X, NotebookPen, Repeat } from 'lucide-react';
import { ASSIGNMENT_TYPES } from '../../../shared/types';
import type { Assignment, AssignmentType } from '../../../shared/types';
import { plainTextToBlocks } from '../../../shared/notes';
import { generateRepeats } from '../../../shared/repeat';
import { useCreateAssignment, useCreateAssignments, useUpdateAssignment } from '../../lib/queries/useAssignments';
import { useCreateNote } from '../../lib/queries/useNotes';
import { useCreateNoteLink } from '../../lib/queries/useNoteLinks';
import EntityNotesList from '../notes/EntityNotesList';

interface Props {
  courseId: string;
  /** Pass an existing assignment to open in edit mode; omit for add mode. */
  assignment?: Assignment;
  isOpen: boolean;
  onClose: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'placeholder:text-muted ' +
  'dark:bg-inset dark:border-line dark:text-ink dark:placeholder:text-muted dark:focus:ring-muted';

export default function AddAssignmentDialog({ courseId, assignment, isOpen, onClose }: Props) {
  const isEditing = !!assignment;

  const [name, setName]       = useState('');
  const [type, setType]       = useState<AssignmentType>('Assignment');
  const [dueDate, setDueDate] = useState('');
  // Optional time of day. Empty string = all-day (stored as null).
  const [dueTime, setDueTime] = useState('');
  // Kept as strings so the inputs can be empty; parsed on submit.
  const [score, setScore]           = useState('');
  const [pointsPossible, setPointsPossible] = useState('');
  // Recurring: when on, the assignment expands into a weekly/biweekly series
  // (numbered copies) up to an end date. Add mode only.
  const [repeat, setRepeat]           = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1); // 1 = weekly, 2 = every 2 weeks
  const [repeatUntil, setRepeatUntil] = useState('');
  // Tracks the one-time import of a legacy plain-text note, so the banner hides immediately.
  const [legacyImported, setLegacyImported] = useState(false);

  const createAssignment  = useCreateAssignment();
  const createAssignments = useCreateAssignments();
  const updateAssignment  = useUpdateAssignment();
  const createNote = useCreateNote();
  const linkNote = useCreateNoteLink();
  const nameRef = useRef<HTMLInputElement>(null);

  // Populate fields when switching between add / edit mode
  useEffect(() => {
    if (!isOpen) return;
    setLegacyImported(false);
    if (assignment) {
      setName(assignment.name);
      setType(assignment.type);
      setDueDate(assignment.due_date.slice(0, 10)); // strip any time component → YYYY-MM-DD
      setDueTime(assignment.due_time ?? '');
      setScore(assignment.score?.toString() ?? '');
      setPointsPossible(assignment.points_possible?.toString() ?? '');
    } else {
      setName('');
      setType('Assignment');
      setDueDate('');
      setDueTime('');
      setScore('');
      setPointsPossible('');
    }
    // Repeat is always reset off — it's an add-mode, per-open choice.
    setRepeat(false);
    setRepeatWeeks(1);
    setRepeatUntil('');
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, assignment]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Recurring is add-mode only; a grade doesn't make sense on a future series.
  const repeating = !isEditing && repeat;

  // A grade needs both halves ("18 out of 20"); one half alone is ignored.
  // Ignored entirely when creating a recurring series.
  const gradeComplete = !repeating && score !== '' && pointsPossible !== '';
  const gradeInvalid =
    gradeComplete && (Number(score) < 0 || Number(pointsPossible) <= 0 || isNaN(Number(score)) || isNaN(Number(pointsPossible)));

  // Follow-up occurrences after the first (the typed one). Empty until a valid
  // end date is set; drives the live preview count and the submit button label.
  const followUps = repeating ? generateRepeats(name, dueDate, repeatUntil, repeatWeeks) : [];
  const totalOccurrences = followUps.length + 1; // includes the first

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate || gradeInvalid) return;

    // Empty string → all-day (null); the same time applies to every occurrence.
    const dueTimeValue = dueTime || null;

    if (repeating) {
      // Expand into independent, numbered copies and insert them atomically —
      // either the whole series saves or none of it does (createMany).
      const series = [
        { courseId, name: name.trim(), type, dueDate, dueTime: dueTimeValue },
        ...followUps.map(o => ({ courseId, name: o.name, type, dueDate: o.dueDate, dueTime: dueTimeValue })),
      ];
      await createAssignments.mutateAsync(series);
      onClose();
      return;
    }

    const gradeFields = {
      score:          gradeComplete ? Number(score) : null,
      pointsPossible: gradeComplete ? Number(pointsPossible) : null,
    };

    if (isEditing) {
      await updateAssignment.mutateAsync({
        id: assignment.id,
        input: { name: name.trim(), type, dueDate, dueTime: dueTimeValue, ...gradeFields },
      });
    } else {
      await createAssignment.mutateAsync({
        courseId,
        name: name.trim(),
        type,
        dueDate,
        dueTime: dueTimeValue,
        ...gradeFields,
      });
    }

    onClose();
  }

  // Migrate an assignment's old plain-text notes into a real linked note (the "Open linked
  // note" model). Non-destructive until the user clicks: it creates the note, links it, then
  // clears the legacy field. The embed below refreshes to show the new note.
  async function importLegacyNote() {
    if (!assignment?.notes?.trim()) return;
    const note = await createNote.mutateAsync({
      title: `${assignment.name} — notes`,
      contentJson: plainTextToBlocks(assignment.notes),
    });
    await linkNote.mutateAsync({ noteId: note.id, entityType: 'assignment', entityId: assignment.id });
    await updateAssignment.mutateAsync({ id: assignment.id, input: { notes: null } });
    setLegacyImported(true);
  }

  const hasLegacyNote = isEditing && !legacyImported && !!assignment?.notes?.trim();

  const isPending = createAssignment.isPending || createAssignments.isPending || updateAssignment.isPending;
  const isError   = createAssignment.isError   || createAssignments.isError   || updateAssignment.isError;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />

      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[88vh] overflow-y-auto animate-pop">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-ink">
            {isEditing ? 'Edit assignment' : 'New assignment'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink-soft transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Homework 3"
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AssignmentType)}
              className={INPUT_CLASS}
            >
              {ASSIGNMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink-soft mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-ink-soft mb-1">
                Time <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                aria-label="Due time (optional)"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Repeat — add mode only. Expands into a numbered weekly/biweekly series. */}
          {!isEditing && (
            <div className="rounded-lg border border-line bg-inset/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <Repeat size={14} className="text-muted" />
                Repeat this assignment
              </label>

              {repeat && (
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap text-sm text-ink-soft">
                    <select
                      value={repeatWeeks}
                      onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                      className={INPUT_CLASS + ' w-auto'}
                    >
                      <option value={1}>every week</option>
                      <option value={2}>every 2 weeks</option>
                    </select>
                    <span className="text-muted">until</span>
                    <input
                      type="date"
                      value={repeatUntil}
                      min={dueDate || undefined}
                      onChange={(e) => setRepeatUntil(e.target.value)}
                      className={INPUT_CLASS + ' w-auto'}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    {!dueDate
                      ? 'Set a due date above to start the series.'
                      : followUps.length === 0
                      ? 'Pick an end date after the due date to add repeats.'
                      : `Creates ${totalOccurrences} assignments — last one due ${followUps[followUps.length - 1].dueDate}.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {!repeating && (
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Grade
              <span className="ml-1 text-muted font-normal">(optional — once it's returned)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Earned"
                min={0}
                step="any"
                aria-label="Points earned"
                className={INPUT_CLASS}
              />
              <span className="text-sm text-muted shrink-0">out of</span>
              <input
                type="number"
                value={pointsPossible}
                onChange={(e) => setPointsPossible(e.target.value)}
                placeholder="Possible"
                min={0}
                step="any"
                aria-label="Points possible"
                className={INPUT_CLASS}
              />
            </div>
            {gradeInvalid && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Points possible must be more than 0 (and earned can't be negative).
              </p>
            )}
          </div>
          )}

          {isError && (
            <p className="text-sm text-red-600">Something went wrong — please try again.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !dueDate || gradeInvalid || isPending}
              className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending
                ? 'Saving…'
                : isEditing
                ? 'Save changes'
                : repeating && followUps.length > 0
                ? `Add ${totalOccurrences} assignments`
                : 'Add assignment'}
            </button>
          </div>
        </form>

        {/* Notes live as linked notes (the "open linked note" model). Available once the
            assignment exists, so this shows in edit mode only. */}
        {isEditing && assignment && (
          <div className="mt-6 border-t border-line pt-5">
            {hasLegacyNote && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-inset px-3 py-2">
                <p className="text-xs text-muted">You have an older quick note saved here.</p>
                <button
                  onClick={importLegacyNote}
                  disabled={createNote.isPending || linkNote.isPending}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs text-accent-ink hover:bg-accent-deep active:scale-[0.98] disabled:opacity-60 transition-colors"
                >
                  <NotebookPen size={13} />
                  Import as note
                </button>
              </div>
            )}
            <EntityNotesList
              entityType="assignment"
              entityId={assignment.id}
              newNoteTitle={`${assignment.name} — `}
            />
          </div>
        )}
      </div>
    </div>
  );
}
