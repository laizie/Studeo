import { Circle, Clock3, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import type { Assignment, AssignmentStatus, Course } from '../../../shared/types';
import { computeDeadlineLabel, formatDueDate } from '../../../shared/deadlines';
import { useUpdateAssignment, useDeleteAssignment } from '../../lib/queries/useAssignments';

interface Props {
  assignment: Assignment;
  onEdit: (assignment: Assignment) => void;
  /** Pass the course to show a colored course badge (used in cross-course views like This Week). */
  course?: Course;
}

// Clicking the status icon cycles through the three states in order.
const STATUS_CYCLE: AssignmentStatus[] = ['not_started', 'in_progress', 'completed'];

function nextStatus(current: AssignmentStatus): AssignmentStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function StatusIcon({ status }: { status: AssignmentStatus }) {
  if (status === 'completed')   return <CheckCircle2 size={17} className="text-green-500" />;
  if (status === 'in_progress') return <Clock3       size={17} className="text-blue-400"  />;
  return                               <Circle       size={17} className="text-stone-300" />;
}

const URGENCY_CLASS: Record<string, string> = {
  overdue:  'text-red-700',
  today:    'text-red-700',
  tomorrow: 'text-orange-700',
  soon:     'text-amber-600',
  week:     'text-green-600',
  later:    'text-green-700',
  future:   'text-green-800',
};

export default function AssignmentRow({ assignment, onEdit, course }: Props) {
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const deadline = computeDeadlineLabel(assignment.due_date);
  const isCompleted = assignment.status === 'completed';

  function handleStatusToggle() {
    updateAssignment.mutate({
      id: assignment.id,
      input: { status: nextStatus(assignment.status) },
    });
  }

  function handleDelete() {
    if (confirm(`Delete "${assignment.name}"?`)) {
      deleteAssignment.mutate(assignment.id);
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-stone-50 dark:hover:bg-[#664433] rounded-lg transition-colors">
      {/* Status toggle — click to advance through not_started → in_progress → completed */}
      <button
        onClick={handleStatusToggle}
        disabled={updateAssignment.isPending}
        className="shrink-0 hover:scale-110 transition-transform disabled:opacity-50"
        title={`Status: ${assignment.status} — click to advance`}
      >
        <StatusIcon status={assignment.status} />
      </button>

      {/* Name */}
      <span
        className={`flex-1 text-sm truncate ${
          isCompleted ? 'line-through text-stone-400 dark:text-[#cc9a58]' : 'text-stone-800 dark:text-[#f0e0cc]'
        }`}
      >
        {assignment.name}
      </span>

      {/* Type badge */}
      <span className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs text-stone-500 dark:text-[#c4a882] bg-stone-100 dark:bg-[#664433]">
        {assignment.type}
      </span>

      {/* Course badge — only shown in cross-course views (e.g. This Week) */}
      {course && (
        <span
          className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: `${course.color}1a`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      )}

      {/* Due date */}
      <span className="shrink-0 text-xs text-stone-400 dark:text-[#e0b870] w-14 text-right hidden md:block">
        {formatDueDate(assignment.due_date)}
      </span>

      {/* Deadline label */}
      <span
        className={`shrink-0 text-xs font-medium w-20 text-right ${
          isCompleted ? 'text-stone-300 dark:text-[#cc9a58]' : URGENCY_CLASS[deadline.urgency]
        }`}
      >
        {isCompleted ? 'Done' : deadline.label}
      </span>

      {/* Edit + delete — revealed on row hover */}
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(assignment)}
          className="p-1 text-stone-400 dark:text-[#e0b870] hover:text-stone-600 dark:hover:text-[#d4b896] rounded transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteAssignment.isPending}
          className="p-1 text-stone-400 hover:text-red-500 rounded transition-colors disabled:opacity-50"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
