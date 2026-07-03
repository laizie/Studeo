import { useState } from 'react';
import { Circle, CheckCircle2, Pencil, Trash2, Target, ListTodo, CalendarPlus } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import SubtaskChecklist from './SubtaskChecklist';
import PlanStudyDialog from '../study/PlanStudyDialog';
import type { Assignment, AssignmentStatus, Course } from '../../../shared/types';
import { computeDeadlineLabel, formatDueDate, formatClock12 } from '../../../shared/deadlines';
import { useUpdateAssignment, useDeleteAssignment } from '../../lib/queries/useAssignments';
import { useSubtasks } from '../../lib/queries/useSubtasks';
import { useStudyListStore } from '../../store/useStudyListStore';
import { URGENCY_CLASS } from '../../lib/urgency';
import { cn } from '../../lib/utils';

interface Props {
  assignment: Assignment;
  onEdit: (assignment: Assignment) => void;
  /** Pass the course to show a colored course badge (used in cross-course views like This Week). */
  course?: Course;
}

// Status is a simple done / not-done toggle (PRD §11, resolved June 2026).
// The schema keeps the 3-state enum, so legacy in_progress rows just render
// as not-done and the decision is trivially reversible.
function StatusIcon({ status }: { status: AssignmentStatus }) {
  return status === 'completed'
    ? <CheckCircle2 size={17} className="text-green-500" />
    : <Circle       size={17} className="text-stone-500" />;
}

export default function AssignmentRow({ assignment, onEdit, course }: Props) {
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const { items: focusItems, addItem: addToFocus, removeItem: removeFromFocus } = useStudyListStore();
  const inFocusList = focusItems.some(i => i.id === assignment.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const { data: allSubtasks } = useSubtasks();
  const subtasks = (allSubtasks ?? []).filter(s => s.assignment_id === assignment.id);
  const doneSteps = subtasks.filter(s => s.completed === 1).length;

  const deadline = computeDeadlineLabel(assignment.due_date);
  const isCompleted = assignment.status === 'completed';

  function handleStatusToggle() {
    updateAssignment.mutate({
      id: assignment.id,
      input: { status: isCompleted ? 'not_started' : 'completed' },
    });
  }

  function handleDelete() {
    setConfirmOpen(true);
  }

  function handleFocusToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (inFocusList) {
      removeFromFocus(assignment.id);
    } else {
      addToFocus({
        id: assignment.id,
        type: 'assignment',
        name: assignment.name,
        courseName: course?.abbreviation || course?.name,
        courseColor: course?.color,
      });
    }
  }

  return (
    <div>
    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-surface-hi rounded-lg transition-colors">
      {/* Status toggle — done / not done */}
      <button
        onClick={handleStatusToggle}
        disabled={updateAssignment.isPending}
        aria-pressed={isCompleted}
        className="shrink-0 hover:scale-110 transition-transform disabled:opacity-50 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
        title={isCompleted ? 'Mark as not done' : 'Mark as done'}
        aria-label={isCompleted ? `Mark ${assignment.name} as not done` : `Mark ${assignment.name} as done`}
      >
        <StatusIcon status={assignment.status} />
      </button>

      {/* Course badge — shown first in cross-course views so color is the first thing seen */}
      {course && (
        <span
          className="shrink-0 px-2 py-0.5 rounded text-xs font-semibold"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      )}

      {/* Name */}
      <span
        className={`flex-1 text-sm truncate ${
          isCompleted ? 'line-through text-muted' : 'text-ink'
        }`}
      >
        {assignment.name}
      </span>

      {/* Type badge */}
      <span className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs text-muted bg-inset">
        {assignment.type}
      </span>

      {/* Due date (with time of day when the assignment has one) */}
      <span className="shrink-0 text-xs text-muted bg-inset px-2 py-0.5 rounded hidden md:block">
        {formatDueDate(assignment.due_date)}
        {assignment.due_time && ` · ${formatClock12(assignment.due_time)}`}
      </span>

      {/* Deadline label */}
      <span
        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
          isCompleted
            ? 'text-muted bg-inset'
            : URGENCY_CLASS[deadline.urgency]
        }`}
      >
        {isCompleted ? 'Done' : deadline.label}
      </span>

      {/* Steps toggle — always visible once steps exist, hover-revealed before */}
      <button
        onClick={() => setStepsOpen(v => !v)}
        aria-expanded={stepsOpen}
        aria-label={subtasks.length > 0
          ? `Show steps (${doneSteps} of ${subtasks.length} done)`
          : 'Break into steps'}
        title={subtasks.length > 0 ? 'Show steps' : 'Break into steps'}
        className={cn(
          'shrink-0 flex items-center gap-1 p-1 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400',
          subtasks.length > 0
            ? (stepsOpen ? 'text-accent' : 'text-muted hover:text-accent')
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-muted hover:text-accent'
        )}
      >
        <ListTodo size={13} />
        {subtasks.length > 0 && <span>{doneSteps}/{subtasks.length}</span>}
      </button>

      {/* Plan study sessions — only for exams, where back-planning makes sense */}
      {assignment.type === 'Exam' && (
        <button
          onClick={(e) => { e.stopPropagation(); setPlanOpen(true); }}
          aria-label={`Plan study sessions for ${assignment.name}`}
          title="Plan study sessions"
          className="shrink-0 p-1 rounded text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CalendarPlus size={13} />
        </button>
      )}

      {/* Focus list toggle */}
      <button
        onClick={handleFocusToggle}
        aria-pressed={inFocusList}
        aria-label={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        className={cn(
          'shrink-0 p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          inFocusList
            ? 'text-accent'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-muted hover:text-accent'
        )}
      >
        <Target size={13} />
      </button>

      {/* Edit + delete — revealed on row hover or keyboard focus */}
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(assignment)}
          aria-label={`Edit ${assignment.name}`}
          className="p-1 text-muted hover:text-stone-600 dark:hover:text-ink-soft rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteAssignment.isPending}
          aria-label={`Delete ${assignment.name}`}
          className="p-1 text-stone-500 hover:text-red-500 rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Delete "${assignment.name}"?`}
        onConfirm={() => deleteAssignment.mutate(assignment.id)}
        onClose={() => setConfirmOpen(false)}
      />

      {planOpen && (
        <PlanStudyDialog assignment={assignment} course={course} onClose={() => setPlanOpen(false)} />
      )}
    </div>

    {stepsOpen && (
      <SubtaskChecklist assignmentId={assignment.id} subtasks={subtasks} />
    )}
    </div>
  );
}
