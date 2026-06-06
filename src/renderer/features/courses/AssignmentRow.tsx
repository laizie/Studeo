import { Circle, Clock3, CheckCircle2, Pencil, Trash2, Target } from 'lucide-react';
import type { Assignment, AssignmentStatus, Course } from '../../../shared/types';
import { computeDeadlineLabel, formatDueDate } from '../../../shared/deadlines';
import { useUpdateAssignment, useDeleteAssignment } from '../../lib/queries/useAssignments';
import { useStudyListStore } from '../../store/useStudyListStore';
import { cn } from '../../lib/utils';

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
  overdue:  'text-red-700 bg-red-100 dark:bg-red-950/70',
  today:    'text-red-700 bg-red-100 dark:bg-red-950/70',
  tomorrow: 'text-orange-700 bg-orange-100 dark:bg-orange-950/70',
  soon:     'text-amber-600 bg-amber-100 dark:bg-amber-950/70',
  week:     'text-green-600 bg-green-100 dark:bg-green-950/70',
  later:    'text-green-700 bg-green-100 dark:bg-green-950/70',
  future:   'text-green-800 bg-green-100 dark:bg-green-950/70',
};

export default function AssignmentRow({ assignment, onEdit, course }: Props) {
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const { items: focusItems, addItem: addToFocus, removeItem: removeFromFocus } = useStudyListStore();
  const inFocusList = focusItems.some(i => i.id === assignment.id);

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
    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-stone-50 dark:hover:bg-[#664433] warm:hover:bg-[#8e6a48] rounded-lg transition-colors">
      {/* Status toggle — click to advance through not_started → in_progress → completed */}
      <button
        onClick={handleStatusToggle}
        disabled={updateAssignment.isPending}
        className="shrink-0 hover:scale-110 transition-transform disabled:opacity-50"
        title={`Status: ${assignment.status} — click to advance`}
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
          isCompleted ? 'line-through text-stone-400 dark:text-[#cc9a58]' : 'text-stone-800 dark:text-[#f0e0cc]'
        }`}
      >
        {assignment.name}
      </span>

      {/* Type badge */}
      <span className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs text-stone-500 dark:text-[#c4a882] bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48]">
        {assignment.type}
      </span>

      {/* Due date */}
      <span className="shrink-0 text-xs text-stone-500 dark:text-[#c4a882] bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48] px-2 py-0.5 rounded hidden md:block">
        {formatDueDate(assignment.due_date)}
      </span>

      {/* Deadline label */}
      <span
        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
          isCompleted
            ? 'text-stone-400 dark:text-[#c4a882] bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48]'
            : URGENCY_CLASS[deadline.urgency]
        }`}
      >
        {isCompleted ? 'Done' : deadline.label}
      </span>

      {/* Focus list toggle */}
      <button
        onClick={handleFocusToggle}
        className={cn(
          'shrink-0 p-1 rounded transition-colors',
          inFocusList
            ? 'text-[#e2a53b]'
            : 'opacity-0 group-hover:opacity-100 text-stone-400 dark:text-[#e0b870] hover:text-[#e2a53b]'
        )}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
      >
        <Target size={13} />
      </button>

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
