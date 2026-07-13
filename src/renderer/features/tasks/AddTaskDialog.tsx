import { useState, useEffect, useRef, useId } from 'react';
import { Repeat } from 'lucide-react';
import DialogShell from '../../components/DialogShell';
import type { Task } from '../../../shared/types';
import { generateRepeats } from '../../../shared/repeat';
import { useCreateTask, useCreateTasks, useUpdateTask } from '../../lib/queries/useTasks';
import { INPUT_CLASS } from '../../lib/inputClass';
import { errorReason } from '../../lib/errors';

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
  const [repeat, setRepeat]           = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1); // 1 = weekly, 2 = every 2 weeks
  const [repeatUntil, setRepeatUntil] = useState('');

  const createTask  = useCreateTask();
  const createTasks = useCreateTasks();
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
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, task]);

  // Recurring is add-mode only. Follow-up occurrences after the first (the typed
  // one); empty until a valid end date is set. Drives the preview + button label.
  const repeating = !isEditing && repeat;
  const followUps = repeating ? generateRepeats(name, dueDate, repeatUntil, repeatWeeks) : [];
  const totalOccurrences = followUps.length + 1; // includes the first

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;

    if (repeating) {
      // Expand into independent, numbered copies and insert them atomically —
      // either the whole series saves or none of it does (createMany).
      const series = [
        { name: name.trim(), dueDate },
        ...followUps.map(o => ({ name: o.name, dueDate: o.dueDate })),
      ];
      await createTasks.mutateAsync(series);
      onClose();
      return;
    }

    if (isEditing) {
      await updateTask.mutateAsync({ id: task.id, input: { name: name.trim(), dueDate } });
    } else {
      await createTask.mutateAsync({ name: name.trim(), dueDate });
    }
    onClose();
  }

  const isPending = createTask.isPending || createTasks.isPending || updateTask.isPending;
  const isError   = createTask.isError   || createTasks.isError   || updateTask.isError;
  const mutationError = createTask.error ?? createTasks.error ?? updateTask.error;

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
