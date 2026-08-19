import type { Assignment, Course, Task } from './types';

/** One entry on today's focus list: a reference to a real assignment or task. */
export interface FocusEntry {
  id: string;
  type: 'assignment' | 'task';
}

/** An entry resolved against the live data — what it's called, which course it's
 *  from, and whether it's done, all as of right now. */
export interface FocusListItem extends FocusEntry {
  name: string;
  courseName?: string;
  courseColor?: string;
  done: boolean;
}

/**
 * Resolve the focus list (a selection of ids) against the current assignments,
 * tasks and courses.
 *
 * Every field an item displays is read from the row here rather than copied when
 * the item was added. That's what keeps the list honest: an assignment ticked off
 * on its course page or in This Week is ticked off here too, because "done" has
 * one home — the row — instead of a second copy that only the focus list wrote to.
 * The same goes for a renamed assignment, or one moved to another course.
 *
 * Entries whose row no longer exists are dropped: it was deleted while sitting on
 * the list, and a ghost you can't tick or open is worse than its absence.
 *
 * Order follows the entries, so the list stays in the order things were added.
 */
export function resolveFocusList(
  entries: FocusEntry[],
  assignments: Assignment[],
  tasks: Task[],
  courses: Course[],
): FocusListItem[] {
  const assignmentById = new Map(assignments.map(a => [a.id, a]));
  const taskById       = new Map(tasks.map(t => [t.id, t]));
  const courseById     = new Map(courses.map(c => [c.id, c]));

  return entries.flatMap<FocusListItem>(entry => {
    if (entry.type === 'task') {
      const task = taskById.get(entry.id);
      if (!task) return [];
      return [{
        id: task.id,
        type: 'task',
        name: task.name,
        done: task.status === 'completed',
      }];
    }

    const assignment = assignmentById.get(entry.id);
    if (!assignment) return [];
    const course = courseById.get(assignment.course_id);
    return [{
      id: assignment.id,
      type: 'assignment',
      name: assignment.name,
      courseName:  course?.abbreviation || course?.name,
      courseColor: course?.color,
      done: assignment.status === 'completed',
    }];
  });
}
