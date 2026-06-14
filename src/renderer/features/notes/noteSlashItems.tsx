import { BookOpen, ClipboardList, CalendarClock, ListTodo, Link2 } from 'lucide-react';
import type { DefaultReactSuggestionItem } from '@blocknote/react';

export interface SlashActions {
  onLinkCourse: () => void;
  onLinkAssignment: () => void;
  onInsertDue: () => void;
  onChecklistToTask: () => void;
  onLinkNotes: () => void;
}

/** Studeo-specific slash menu commands, grouped under "Studeo" below the default blocks. */
export function studeoSlashItems(actions: SlashActions): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'Link course',
      group: 'Studeo',
      subtext: 'Attach this note to a course',
      aliases: ['link', 'course', 'class'],
      icon: <BookOpen size={18} />,
      onItemClick: actions.onLinkCourse,
    },
    {
      title: 'Link assignment',
      group: 'Studeo',
      subtext: 'Attach this note to an assignment',
      aliases: ['link', 'assignment', 'hw'],
      icon: <ClipboardList size={18} />,
      onItemClick: actions.onLinkAssignment,
    },
    {
      title: 'Due date',
      group: 'Studeo',
      subtext: 'Insert a due-date line',
      aliases: ['due', 'deadline', 'date'],
      icon: <CalendarClock size={18} />,
      onItemClick: actions.onInsertDue,
    },
    {
      title: 'Turn into task',
      group: 'Studeo',
      subtext: 'Add this line to your Tasks',
      aliases: ['task', 'todo', 'checklist'],
      icon: <ListTodo size={18} />,
      onItemClick: actions.onChecklistToTask,
    },
    {
      title: 'Link notes',
      group: 'Studeo',
      subtext: 'Insert links to other notes (exam review / study guide)',
      aliases: ['link', 'notes', 'reference', 'study', 'guide'],
      icon: <Link2 size={18} />,
      onItemClick: actions.onLinkNotes,
    },
  ];
}
