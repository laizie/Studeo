import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Subtask } from '../../../shared/types';
import { useCreateSubtask, useUpdateSubtask, useDeleteSubtask } from '../../lib/queries/useSubtasks';
import { cn } from '../../lib/utils';

interface Props {
  assignmentId: string;
  subtasks: Subtask[];
}

// The checklist that expands under an assignment row: toggle steps done,
// remove them, add new ones. Deliberately independent of the assignment's
// own status — finishing every step doesn't auto-complete the assignment.
export default function SubtaskChecklist({ assignmentId, subtasks }: Props) {
  const [newName, setNewName] = useState('');

  const createSubtask = useCreateSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    await createSubtask.mutateAsync({ assignmentId, name });
  }

  return (
    <div className="ml-10 mr-3 mb-2.5 space-y-0.5">
      {subtasks.map(s => {
        const done = s.completed === 1;
        return (
          <div key={s.id} className="flex items-center gap-2 group/step py-0.5">
            <input
              type="checkbox"
              checked={done}
              onChange={() => updateSubtask.mutate({ id: s.id, input: { completed: !done } })}
              aria-label={done ? `Mark step "${s.name}" as not done` : `Mark step "${s.name}" as done`}
              className="size-3.5 shrink-0 rounded border-line accent-[#e2a53b] cursor-pointer"
            />
            <span className={cn('flex-1 text-xs', done ? 'line-through text-muted' : 'text-ink-soft')}>
              {s.name}
            </span>
            <button
              onClick={() => deleteSubtask.mutate(s.id)}
              aria-label={`Remove step "${s.name}"`}
              className="p-0.5 text-muted opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 hover:text-red-500 rounded transition-opacity"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
        <Plus size={13} className="text-muted shrink-0" />
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Add a step…"
          className="flex-1 text-xs bg-transparent text-ink placeholder:text-muted focus:outline-none py-0.5 border-b border-transparent focus:border-line"
        />
      </form>
    </div>
  );
}
