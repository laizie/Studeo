import { useState, useEffect, useRef, useId } from 'react';
import { Repeat } from 'lucide-react';
import DialogShell from '../../components/DialogShell';
import SeriesScopeField from '../../components/SeriesScopeField';
import StopRepeatingTaskAction from './StopRepeatingTaskAction';
import type { SeriesScope, Task } from '../../../shared/types';
import { generateRepeats } from '../../../shared/repeat';
import {
  useCreateTask,
  useUpdateTask,
  useApplyToTaskSeries,
  useSetTaskNames,
} from '../../lib/queries/useTasks';
import { useCreateTaskSeries } from '../../lib/queries/useTaskSeries';
import { INPUT_CLASS } from '../../lib/inputClass';
import { errorReason } from '../../lib/errors';
import { showToast, showUndoToast } from '../../store/useToastStore';

interface Props {
  task?: Task;
  isOpen: boolean;
  onClose: () => void;
}


export default function AddTaskDialog({ task, isOpen, onClose }: Props) {
  const isEditing = !!task;

  const [name, setName]       = useState('');
  const [dueDate, setDueDate] = useState('');
  // Recurring: when on, the task expands into a weekly/biweekly series (numbered
  // copies) up to an end date. Add mode only — same model as recurring assignments.
  // How far a rename of a series occurrence reaches. Tasks have no time of day,
  // so this governs the name alone; the date has its own surface (Move dates).
  const [seriesScope, setSeriesScope] = useState<SeriesScope>('one');
  const [repeat, setRepeat]           = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1); // 1 = weekly, 2 = every 2 weeks
  const [repeatUntil, setRepeatUntil] = useState('');

  const createTask  = useCreateTask();
  const createSeries = useCreateTaskSeries();
  const applyToSeries = useApplyToTaskSeries();
  const setNames = useSetTaskNames();
  const updateTask  = useUpdateTask();
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!isOpen) return;
    if (task) {
      setName(task.name);
      setDueDate(task.due_date.slice(0, 10));
    } else {
      setName('');
      setDueDate('');
    }
    // Repeat is always reset off — it's an add-mode, per-open choice.
    setRepeat(false);
    setRepeatWeeks(1);
    setRepeatUntil('');
    // So is the scope: a remembered "all of them" would turn the next small
    // correction into a silent rewrite of the whole series.
    setSeriesScope('one');
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, task]);

  // Recurring is add-mode only. Follow-up occurrences after the first (the typed
  // one); empty until a valid end date is set. Drives the preview + button label.
  const repeating = !isEditing && repeat;
  const inSeries = isEditing && task.series_id != null;
  const followUps = repeating ? generateRepeats(name, dueDate, repeatUntil, repeatWeeks) : [];
  const totalOccurrences = followUps.length + 1; // includes the first

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;

    try {
      if (repeating) {
        // Save the repeat RULE alongside the rows it expands to, so the series
        // still knows it's a series afterwards — the same change assignments got.
        // The previous version inserted the same rows with createMany and they
        // came out strangers, which is why a slipped chore meant editing each one.
        const { tasks } = await createSeries.mutateAsync({
          name: name.trim(),
          anchorDate: dueDate,
          untilDate: repeatUntil,
          intervalWeeks: repeatWeeks,
        });
        showToast(`Added ${tasks.length} tasks`);
        onClose();
        return;
      }

      if (isEditing) {
        // The date is written here; the name goes through applyToSeries whenever
        // a wider scope is in play — including for the anchor, so that it lands
        // in the change list and Undo can take the whole rename back. Writing it
        // here first would leave the anchor renamed after an Undo. (Same reasoning
        // as AddAssignmentDialog, where it's spelled out.)
        const scoped = inSeries && seriesScope !== 'one';
        await updateTask.mutateAsync({
          id: task.id,
          input: { dueDate, ...(scoped ? {} : { name: name.trim() }) },
        });

        if (scoped) {
          const { changed } = await applyToSeries.mutateAsync({
            taskId: task.id,
            scope: seriesScope,
            name: name.trim(),
          });
          if (changed.length > 0) {
            const label = changed.length === 1 ? '1 task' : `${changed.length} tasks`;
            showUndoToast(`Renamed ${label}`, () =>
              setNames.mutate(changed.map(c => ({ id: c.id, name: c.from }))),
            );
            onClose();
            return;
          }
        }

        showToast(`Saved “${name.trim()}”`);
      } else {
        await createTask.mutateAsync({ name: name.trim(), dueDate });
        showToast(`Added “${name.trim()}”`);
      }
      onClose();
    } catch {
      // mutateAsync rethrows on failure. Skipping the rest is the behaviour we want —
      // the surface stays open holding what the user typed — but the rejection still
      // has to be *handled* or it surfaces as an unhandled promise rejection. The
      // mutation cache's global onError has already shown the user a toast.
    }
  }

  const isPending =
    createTask.isPending || createSeries.isPending || updateTask.isPending || applyToSeries.isPending;
  const isError   = createTask.isError   || createSeries.isError   || updateTask.isError;
  const mutationError = createTask.error ?? createSeries.error ?? updateTask.error;

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit task' : 'New task'}
      maxWidth="max-w-sm"
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-ink-soft mb-1">Name</label>
            <input
              id={`${uid}-name`}
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Read chapter 5"
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor={`${uid}-due`} className="block text-sm font-medium text-ink-soft mb-1">Due date</label>
            <input
              id={`${uid}-due`}
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          {/* Scope — edit mode, series occurrences only. Governs the name; the
              date has its own surface (Move dates), where finished work is protected. */}
          {inSeries && (
            <SeriesScopeField
              value={seriesScope}
              onChange={setSeriesScope}
              label="Apply the name to"
              hint={
                seriesScope === 'one'
                  ? 'Only this occurrence changes.'
                  : seriesScope === 'this_and_later'
                    ? 'This occurrence and the ones after it, renumbered from this one. Finished ones included — a name isn’t a date.'
                    : 'Every occurrence, renumbered from this one. Finished ones included — a name isn’t a date.'
              }
            />
          )}

          {/* Cutting the series short. Under the scope control because both are
              about the series rather than this row, and apart from the fields
              above because it's the destructive one. */}
          {isEditing && task && <StopRepeatingTaskAction task={task} onDone={onClose} />}

          {/* Repeat — add mode only. Expands into a numbered weekly/biweekly series. */}
          {!isEditing && (
            <div className="rounded-lg border border-line bg-inset/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={e => setRepeat(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <Repeat size={14} className="text-muted" />
                Repeat this task
              </label>

              {repeat && (
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap text-sm text-ink-soft">
                    <select
                      value={repeatWeeks}
                      onChange={e => setRepeatWeeks(Number(e.target.value))}
                      aria-label="Repeat frequency"
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
                      onChange={e => setRepeatUntil(e.target.value)}
                      aria-label="Repeat until date"
                      className={INPUT_CLASS + ' w-auto'}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    {!dueDate
                      ? 'Set a due date above to start the series.'
                      : followUps.length === 0
                      ? 'Pick an end date after the due date to add repeats.'
                      : `Creates ${totalOccurrences} tasks — last one due ${followUps[followUps.length - 1].dueDate}.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-600">{errorReason(mutationError) ?? 'Something went wrong'} — please try again.</p>
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
              disabled={!name.trim() || !dueDate || isPending}
              className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending
                ? 'Saving…'
                : isEditing
                ? 'Save changes'
                : repeating && followUps.length > 0
                ? `Add ${totalOccurrences} tasks`
                : 'Add task'}
            </button>
          </div>
        </form>
    </DialogShell>
  );
}
