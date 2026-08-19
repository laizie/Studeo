import { useState } from 'react';
import { Plus, X, BookOpen, ListTodo, CheckCircle2, Circle } from 'lucide-react';
import { useStudyListStore } from '../../store/useStudyListStore';
import { useFocusList } from '../../lib/useFocusList';
import { showUndoToast } from '../../store/useToastStore';
import { useUpdateAssignment } from '../../lib/queries/useAssignments';
import { useUpdateTask } from '../../lib/queries/useTasks';
import StudyPickerDialog from './StudyPickerDialog';
import { courseInk, coursePillBg } from '../../lib/colors';
import { cn } from '../../lib/utils';

// Today's Focus List: the handful of assignments and tasks you've decided to work on
// right now. It lives on the Study page and on the Dashboard, so it's one component
// rather than two drifting copies.
//
// The store holds only which items are on the list; their names, courses and done
// state are resolved from the live data by useFocusList. So ticking a box here
// writes the real status through the normal mutation and the row re-renders from
// that — and an item ticked off anywhere else in the app arrives ticked here.

interface Props {
  /** Render the panel's own "Today's Focus List" heading. Off on the Dashboard,
   *  where the surrounding section already labels it in that page's header style
   *  and a second title would just repeat it. */
  showTitle?: boolean;
}

export default function FocusListPanel({ showTitle = true }: Props) {
  const { removeItem, clear } = useStudyListStore();
  const items = useFocusList();
  const [pickerOpen, setPickerOpen] = useState(false);
  const updateAssignment = useUpdateAssignment();
  const updateTask       = useUpdateTask();

  function handleToggle(id: string, type: 'assignment' | 'task', currentlyDone: boolean, name: string) {
    const status = currentlyDone ? 'not_started' : 'completed';
    const mutation = type === 'assignment' ? updateAssignment : updateTask;
    mutation.mutate(
      { id, input: { status } },
      {
        onSuccess: () => {
          if (currentlyDone) return; // unchecking is its own undo
          // Undo only has to put the status back: the checkbox reads the row.
          showUndoToast(`Marked “${name}” done`, () =>
            mutation.mutate({ id, input: { status: 'not_started' } }),
          );
        },
      },
    );
  }

  const doneCount = items.filter(i => i.done).length;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {showTitle ? (
          <div>
            <h2 className="text-sm font-semibold text-ink-soft">
              Today's Focus List
            </h2>
            {items.length > 0 && (
              <p className="text-xs text-muted mt-0.5">
                {doneCount} of {items.length} done
              </p>
            )}
          </div>
        ) : (
          // The progress line is the part worth keeping when the title goes; an
          // empty div still holds the buttons at the right edge.
          <p className="text-xs text-muted">
            {items.length > 0 && `${doneCount} of ${items.length} done`}
          </p>
        )}
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={clear}
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full py-8 text-center border-2 border-dashed border-line rounded-xl cursor-pointer hover:border-stone-300 dark:hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors"
        >
          <p className="text-sm text-muted">
            No assignments or tasks added yet.
          </p>
          <p className="text-xs text-muted mt-1">
            Click to pick what you're working on today
          </p>
        </button>
      ) : (
        <div className="bg-inset border border-line rounded-xl overflow-hidden divide-y divide-line">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 group hover:bg-surface-hi transition-colors"
            >
              <button
                onClick={() => handleToggle(item.id, item.type, item.done, item.name)}
                className="shrink-0 hover:scale-110 transition-transform"
                title={item.done ? 'Mark incomplete' : 'Mark complete'}
              >
                {item.done
                  ? <CheckCircle2 size={17} className="text-green-500" />
                  : <Circle size={17} className="text-muted" />
                }
              </button>

              <span className={cn(
                'flex-1 text-sm truncate',
                item.done
                  ? 'line-through text-muted'
                  : 'text-ink'
              )}>
                {item.name}
              </span>

              <span className="shrink-0 hidden sm:flex items-center gap-1 text-xs text-muted">
                {item.type === 'assignment'
                  ? <BookOpen size={11} />
                  : <ListTodo size={11} />
                }
              </span>

              {item.courseName && (
                <span
                  className="shrink-0 hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: coursePillBg(item.courseColor ?? ''),
                    color: courseInk(item.courseColor ?? ''),
                  }}
                >
                  {item.courseName}
                </span>
              )}

              <button
                onClick={() => removeItem(item.id)}
                aria-label={`Remove ${item.name} from focus list`}
                title="Remove from focus list"
                className="shrink-0 p-1 rounded text-muted hover:text-ink-soft opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <StudyPickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
