import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ASSIGNMENT_TYPES } from '../../../shared/types';
import type { Assignment, AssignmentType } from '../../../shared/types';
import { useCreateAssignment, useUpdateAssignment } from '../../lib/queries/useAssignments';

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
  'placeholder:text-stone-500 ' +
  'dark:bg-[#332211] warm:bg-[#3d2918] dark:border-[#221408] warm:border-[#423428] dark:text-[#f0e0cc] dark:placeholder:text-[#e0b870] dark:focus:ring-[#e0b870]';

export default function AddAssignmentDialog({ courseId, assignment, isOpen, onClose }: Props) {
  const isEditing = !!assignment;

  const [name, setName]       = useState('');
  const [type, setType]       = useState<AssignmentType>('Assignment');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes]     = useState('');

  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const nameRef = useRef<HTMLInputElement>(null);

  // Populate fields when switching between add / edit mode
  useEffect(() => {
    if (!isOpen) return;
    if (assignment) {
      setName(assignment.name);
      setType(assignment.type);
      setDueDate(assignment.due_date.slice(0, 10)); // strip any time component → YYYY-MM-DD
      setNotes(assignment.notes ?? '');
    } else {
      setName('');
      setType('Assignment');
      setDueDate('');
      setNotes('');
    }
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, assignment]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;

    if (isEditing) {
      await updateAssignment.mutateAsync({
        id: assignment.id,
        input: {
          name: name.trim(),
          type,
          dueDate,
          notes: notes.trim() || null,
        },
      });
    } else {
      await createAssignment.mutateAsync({
        courseId,
        name: name.trim(),
        type,
        dueDate,
        notes: notes.trim() || undefined,
      });
    }

    onClose();
  }

  const isPending = createAssignment.isPending || updateAssignment.isPending;
  const isError   = createAssignment.isError   || updateAssignment.isError;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-ink">
            {isEditing ? 'Edit assignment' : 'New assignment'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-stone-600 dark:hover:text-[#d4b896] transition-colors">
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

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Notes
              <span className="ml-1 text-stone-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes…"
              rows={2}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          {isError && (
            <p className="text-sm text-red-600">Something went wrong — please try again.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-600 dark:text-[#c4a882] hover:text-stone-800 dark:hover:text-[#e8d5c0] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !dueDate || isPending}
              className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Add assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
