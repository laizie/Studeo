import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { Pencil, NotebookPen, CheckCircle2, ArrowRight, Circle } from 'lucide-react';
import { format, parse, startOfWeek, endOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { View } from 'react-big-calendar';
import { usePageFiltersStore, type CalendarMode, type CalendarView } from '../../store/usePageFiltersStore';
// react-big-calendar's stock stylesheet is imported from src/index.css into a
// low-priority cascade layer, NOT here — importing it from this component put it
// after index.css in the bundle, where it beat every theme override we'd written.
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useMeetingExceptions } from '../../lib/queries/useMeetingExceptions';
import { buildExceptionIndex, resolveOccurrence, type ExceptionIndex } from '../../../shared/meetingExceptions';
import { useTasks } from '../../lib/queries/useTasks';
import { useStudyBlocks, useUpdateStudyBlock } from '../../lib/queries/useStudyBlocks';
import { parseDateLocal, formatClock12 } from '../../../shared/deadlines';
import type { Assignment, ClassMeeting, Course, Task, StudyBlock } from '../../../shared/types';
import { ACCENT_TOKEN, calendarChipStyle, DEFAULT_COURSE_COLOR, TASK_COLOR } from '../../lib/colors';
import QueryErrorState from '../../components/QueryErrorState';
import Switch from '../../components/Switch';
import { showUndoToast } from '../../store/useToastStore';
import LectureNotesDialog from '../notes/LectureNotesDialog';
import AddAssignmentDialog from '../courses/AddAssignmentDialog';
import AddTaskDialog from '../tasks/AddTaskDialog';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { cn } from '../../lib/utils';

// ── Localizer ────────────────────────────────────────────────────────────────
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

// Where the week/day grid is scrolled on open. Only the time-of-day is read, so
// the date part is arbitrary. 7am puts a normal first class near the top edge.
const WEEK_VIEW_SCROLL_TO = new Date(1970, 0, 1, 7, 0, 0);

// ── Event types ──────────────────────────────────────────────────────────────
type AssignmentEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  resource: { type: 'assignment'; assignment: Assignment; course: Course | undefined };
};

type MeetingEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: false;
  resource: { type: 'meeting'; meeting: ClassMeeting; course: Course | undefined };
};

type TaskEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  resource: { type: 'task'; task: Task };
};

type StudyBlockEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  resource: { type: 'studyBlock'; block: StudyBlock; course: Course | undefined };
};

type CalEvent = AssignmentEvent | MeetingEvent | TaskEvent | StudyBlockEvent;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function expandMeetingsForRange(
  meetings: ClassMeeting[],
  courseMap: Map<string, Course>,
  exceptionIndex: ExceptionIndex,
  rangeStart: Date,
  rangeEnd: Date,
): MeetingEvent[] {
  const events: MeetingEvent[] = [];

  // Step back to the Sunday at or before rangeStart
  const firstSunday = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

  let weekSunday = new Date(firstSunday);

  while (weekSunday <= rangeEnd) {
    for (const m of meetings) {
      const eventDay = new Date(
        weekSunday.getFullYear(),
        weekSunday.getMonth(),
        weekSunday.getDate() + m.day_of_week,
      );
      if (eventDay >= rangeStart && eventDay <= rangeEnd) {
        // Exceptions override single occurrences: skip cancelled dates,
        // use the moved time/room when one applies.
        const occ = resolveOccurrence(m, toDateStr(eventDay), exceptionIndex);
        if (occ.cancelled) continue;

        const [sh, sm] = occ.startTime.split(':').map(Number);
        const [eh, em] = occ.endTime.split(':').map(Number);
        const course = courseMap.get(m.course_id);
        const abbr = course?.abbreviation ?? '?';
        events.push({
          title: (occ.location ? `${abbr} — ${occ.location}` : abbr) + (occ.moved ? ' (moved)' : ''),
          start: new Date(eventDay.getFullYear(), eventDay.getMonth(), eventDay.getDate(), sh, sm),
          end:   new Date(eventDay.getFullYear(), eventDay.getMonth(), eventDay.getDate(), eh, em),
          allDay: false,
          resource: { type: 'meeting', meeting: m, course },
        });
      }
    }
    weekSunday = new Date(
      weekSunday.getFullYear(), weekSunday.getMonth(), weekSunday.getDate() + 7
    );
  }

  return events;
}

// ── Event popover ─────────────────────────────────────────────────────────────
// One click model for the whole calendar: clicking any event opens this, and the
// popover holds the verbs. Before, a click did four different things depending on
// what you hit — and on a study block it silently *wrote* (toggled it done). A
// calendar click should show, not mutate; the mutation is now a labeled button.
//
// `position: fixed` because the calendar's scroll containers have overflow
// clipping — an absolutely-positioned popover inside a month cell gets cut off.

interface PopoverProps {
  event: CalEvent;
  /** Viewport coords of the click that opened it. */
  anchor: { x: number; y: number };
  onClose: () => void;
  onEditAssignment: (a: Assignment) => void;
  onEditTask: (t: Task) => void;
  onOpenLectureNotes: (m: ClassMeeting, course: Course | undefined, date: string) => void;
  onToggleStudyBlock: (b: StudyBlock) => void;
  studyBlockPending: boolean;
}

const POPOVER_W = 248;

function EventPopover({
  event, anchor, onClose,
  onEditAssignment, onEditTask, onOpenLectureNotes, onToggleStudyBlock, studyBlockPending,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the panel on screen: flip left / lift up near the viewport edges.
  const left = Math.min(anchor.x, window.innerWidth - POPOVER_W - 12);
  const top  = Math.min(anchor.y + 8, window.innerHeight - 190);

  const r = event.resource;
  const course = r.type === 'task' ? undefined : r.course;

  // One shared action-row recipe so every verb in the popover looks alike.
  const ACTION =
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-soft ' +
    'hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

  return (
    <>
      {/* Click-away scrim. Transparent, but it also stops the click landing on
          another event underneath and immediately reopening the popover. */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Calendar item"
        className="animate-pop fixed z-[61] rounded-xl border border-line bg-surface p-2 shadow-2xl"
        style={{ left, top, width: POPOVER_W }}
      >
        {/* Identity — who this is, before what you can do to it */}
        <div className="flex items-start gap-2 px-2 pb-2 pt-1">
          {course && (
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: course.color }}
              aria-hidden
            />
          )}
          {r.type === 'task' && (
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-task" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {r.type === 'assignment' ? r.assignment.name
                : r.type === 'task'    ? r.task.name
                : r.type === 'meeting' ? (course?.name ?? 'Class')
                : r.block.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {r.type === 'assignment' ? r.assignment.type
                : r.type === 'task'    ? 'Task'
                : r.type === 'meeting' ? `${format(event.start, 'EEE, MMM d')} · ${format(event.start, 'p')}`
                : `Study block · ${r.block.duration_minutes} min`}
            </p>
          </div>
        </div>

        <div className="h-px bg-line" />

        <div className="pt-1">
          {r.type === 'assignment' && (
            <button className={ACTION} onClick={() => { onEditAssignment(r.assignment); onClose(); }}>
              <Pencil size={14} className="shrink-0 text-muted" /> Edit assignment
            </button>
          )}

          {r.type === 'task' && (
            <button className={ACTION} onClick={() => { onEditTask(r.task); onClose(); }}>
              <Pencil size={14} className="shrink-0 text-muted" /> Edit task
            </button>
          )}

          {r.type === 'meeting' && (
            <button
              className={ACTION}
              onClick={() => { onOpenLectureNotes(r.meeting, r.course, toDateStr(event.start)); onClose(); }}
            >
              <NotebookPen size={14} className="shrink-0 text-muted" /> Lecture notes
            </button>
          )}

          {r.type === 'studyBlock' && (
            <button
              className={ACTION}
              disabled={studyBlockPending}
              onClick={() => { onToggleStudyBlock(r.block); onClose(); }}
            >
              {r.block.status === 'done'
                ? <><Circle size={14} className="shrink-0 text-muted" /> Back to planned</>
                : <><CheckCircle2 size={14} className="shrink-0 text-muted" /> Mark done</>}
            </button>
          )}

          {course && (
            <Link
              to={`/courses/${course.id}`}
              onClick={onClose}
              className={ACTION}
            >
              <ArrowRight size={14} className="shrink-0 text-muted" /> Open {course.abbreviation || course.name}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
type Mode = CalendarMode;

export default function CalendarPage() {
  const { data: courses,     isError: coursesError,     refetch: refetchCourses     } = useCourses();
  const { data: assignments, isError: assignmentsError, refetch: refetchAssignments } = useAssignments();
  const { data: allMeetings, isError: meetingsError,    refetch: refetchMeetings    } = useClassMeetings();
  const { data: exceptions }   = useMeetingExceptions();
  const { data: tasks }        = useTasks();
  const { data: studyBlocks }  = useStudyBlocks();
  const updateStudyBlock       = useUpdateStudyBlock();

  const hasError = coursesError || assignmentsError || meetingsError;

  const mode                = usePageFiltersStore(s => s.calendarMode);
  const setMode             = usePageFiltersStore(s => s.setCalendarMode);
  const calView             = usePageFiltersStore(s => s.calendarView) as View;
  const setCalView          = usePageFiltersStore(s => s.setCalendarView);
  const calendarShowTasks   = usePageFiltersStore(s => s.calendarShowTasks);
  const setCalendarShowTasks = usePageFiltersStore(s => s.setCalendarShowTasks);
  const calendarShowStudyBlocks    = usePageFiltersStore(s => s.calendarShowStudyBlocks);
  const setCalendarShowStudyBlocks = usePageFiltersStore(s => s.setCalendarShowStudyBlocks);
  const [calDate, setCalDate] = useState(new Date());
  // The dated lecture whose notes dialog is open (opened from the event popover).
  const [lectureSel, setLectureSel] = useState<{ meeting: ClassMeeting; course?: Course; date: string } | null>(null);
  // The clicked event and where it was clicked — drives the one event popover.
  const [selected, setSelected] = useState<{ event: CalEvent; anchor: { x: number; y: number } } | null>(null);
  // Editors opened from the popover, so a calendar item edits in the same dialog
  // it would from its own list — one row model everywhere.
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Track the visible range so we only expand meetings for what's on screen.
  // react-big-calendar only reports a range on NAVIGATION, so the initial value
  // must already cover everything the first paint can show: the month grid's
  // leading/trailing days, and (in week view) a current week that spans a month
  // boundary. Padding the month out to full weeks covers both.
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>(() => ({
    start: startOfWeek(startOfMonth(new Date())),
    end:   endOfWeek(endOfMonth(new Date())),
  }));

  const courseMap = useMemo(
    () => new Map((courses ?? []).map(c => [c.id, c])),
    [courses]
  );

  // ── Events ──────────────────────────────────────────────────────────────────

  const assignmentEvents = useMemo((): AssignmentEvent[] => {
    if (!assignments) return [];
    return assignments.map(a => {
      const date = parseDateLocal(a.due_date);
      const course = courseMap.get(a.course_id);
      const base = course ? `[${course.abbreviation}] ${a.name}` : a.name;
      return {
        title: a.due_time ? `${base} · ${formatClock12(a.due_time)}` : base,
        start: date,
        end:   date,
        allDay: true,
        resource: { type: 'assignment', assignment: a, course },
      };
    });
  }, [assignments, courseMap]);

  const lectureEvents = useMemo((): MeetingEvent[] => {
    if (!allMeetings) return [];
    const index = buildExceptionIndex(exceptions ?? []);
    return expandMeetingsForRange(allMeetings, courseMap, index, visibleRange.start, visibleRange.end);
  }, [allMeetings, exceptions, courseMap, visibleRange]);

  const taskEvents = useMemo((): TaskEvent[] => {
    if (!tasks) return [];
    return tasks
      .filter(t => t.due_date)
      .map(t => {
        const date = parseDateLocal(t.due_date);
        return {
          title: t.name,
          start: date,
          end:   date,
          allDay: true as const,
          resource: { type: 'task' as const, task: t },
        };
      });
  }, [tasks]);

  const studyBlockEvents = useMemo((): StudyBlockEvent[] => {
    if (!studyBlocks) return [];
    return studyBlocks.map(b => {
      const date = parseDateLocal(b.scheduled_date);
      return {
        title: b.title,
        start: date,
        end:   date,
        allDay: true as const,
        resource: { type: 'studyBlock' as const, block: b, course: b.course_id ? courseMap.get(b.course_id) : undefined },
      };
    });
  }, [studyBlocks, courseMap]);

  const events: CalEvent[] = useMemo(() => {
    if (mode !== 'assignments') return lectureEvents;
    const base: CalEvent[] = [...assignmentEvents];
    if (calendarShowTasks)       base.push(...taskEvents);
    if (calendarShowStudyBlocks) base.push(...studyBlockEvents);
    return base;
  }, [mode, assignmentEvents, lectureEvents, taskEvents, studyBlockEvents, calendarShowTasks, calendarShowStudyBlocks]);

  // ── Calendar callbacks ───────────────────────────────────────────────────────

  const handleRangeChange = useCallback(
    (range: Date[] | { start: Date; end: Date }) => {
      if (Array.isArray(range)) {
        setVisibleRange({ start: range[0], end: range[range.length - 1] });
      } else {
        setVisibleRange(range);
      }
    },
    []
  );

  // Clicking an event never mutates or navigates on its own — it opens the
  // popover next to the click, and the popover carries the verbs.
  const handleSelectEvent = useCallback(
    (event: CalEvent, e: React.SyntheticEvent<HTMLElement>) => {
      const native = e.nativeEvent as MouseEvent;
      // Keyboard activation reports 0,0 — fall back to the event chip's own box.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const anchor = native.clientX || native.clientY
        ? { x: native.clientX, y: native.clientY }
        : { x: rect.left, y: rect.bottom };
      setSelected({ event, anchor });
    },
    []
  );

  // The explicit "Mark done" verb from the popover. Undoable, like every other
  // status change in the app.
  const toggleStudyBlock = useCallback(
    (block: StudyBlock) => {
      if (updateStudyBlock.isPending) return;
      const nowDone = block.status !== 'done';
      updateStudyBlock.mutate(
        { id: block.id, input: { status: nowDone ? 'done' : 'planned' } },
        {
          onSuccess: () =>
            showUndoToast(
              nowDone ? `Marked “${block.title}” done` : `“${block.title}” back to planned`,
              () => updateStudyBlock.mutate({ id: block.id, input: { status: block.status } }),
            ),
        },
      );
    },
    [updateStudyBlock]
  );

  // Every chip's fill comes from one recipe in lib/colors, so "which class?" is
  // answered the same way here as it is by the pills on every other screen — and
  // a completed item keeps its course hue instead of flattening to a gray that
  // only ever looked right on the light theme.
  const eventPropGetter = useCallback((event: CalEvent) => {
    if (event.resource.type === 'studyBlock') {
      // Study blocks aren't a course deadline, they're planned time — so they read
      // as the app's amber accent in the same tinted style, never a solid fill.
      // Composited against theme tokens so the tint follows light/dark/warm.
      const block = event.resource.block;
      const settled = block.status !== 'planned';
      return {
        style: {
          ...calendarChipStyle(ACCENT_TOKEN, { done: true }),
          ...(settled && {
            backgroundColor: 'color-mix(in srgb, var(--muted) 15%, var(--inset))',
            borderColor:     'color-mix(in srgb, var(--muted) 35%, transparent)',
            color:           'var(--muted)',
          }),
          textDecoration: block.status === 'done' ? 'line-through' : 'none',
        },
      };
    }

    if (event.resource.type === 'task') {
      return {
        style: calendarChipStyle(TASK_COLOR, {
          done: event.resource.task.status === 'completed',
        }),
      };
    }

    return {
      style: calendarChipStyle(event.resource.course?.color ?? DEFAULT_COURSE_COLOR, {
        done:
          event.resource.type === 'assignment' &&
          event.resource.assignment.status === 'completed',
      }),
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 flex flex-col h-full">
      {/* Header — wraps rather than overflowing: at the app's narrower window
          widths the four controls used to run off the right edge, clipping the
          mode switcher entirely. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-5 shrink-0">
        <h1 className="text-2xl font-semibold text-ink">Calendar</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tasks toggle — only meaningful in Assignments mode */}
          {mode === 'assignments' && (
            <button
              role="switch"
              aria-checked={calendarShowTasks}
              onClick={() => setCalendarShowTasks(!calendarShowTasks)}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm rounded-lg border border-line bg-inset text-muted hover:bg-surface-hi transition-colors"
            >
              <Switch checked={calendarShowTasks} size="sm" tone="task" />
              Tasks
            </button>
          )}

          {/* Study plan toggle — the back-planned study blocks */}
          {mode === 'assignments' && (
            <button
              role="switch"
              aria-checked={calendarShowStudyBlocks}
              onClick={() => setCalendarShowStudyBlocks(!calendarShowStudyBlocks)}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm rounded-lg border border-line bg-inset text-muted hover:bg-surface-hi transition-colors"
            >
              <Switch checked={calendarShowStudyBlocks} size="sm" tone="accent" />
              Study plan
            </button>
          )}

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-inset rounded-lg">
            {(['assignments', 'lectures'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  // Each mode keeps its own natural home view; assignments can
                  // still switch to week from the calendar's own toolbar.
                  setCalView(m === 'lectures' ? 'week' : 'month');
                }}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors capitalize',
                  mode === m
                    ? 'bg-surface text-ink shadow-sm font-medium'
                    : ' text-muted hover:bg-surface-hi'
                )}
              >
                {m === 'assignments' ? 'Assignments' : 'Lecture Schedule'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error — a failed load must not render as an empty calendar */}
      {hasError && (
        <QueryErrorState
          title="Couldn't load your calendar"
          onRetry={() => { refetchCourses(); refetchAssignments(); refetchMeetings(); }}
        />
      )}

      {/* Empty hint — a blank grid teaches nothing */}
      {!hasError && events.length === 0 && (
        <p className="mb-3 text-sm text-muted shrink-0">
          {mode === 'assignments'
            ? 'Nothing here yet — assignments you add will appear color-coded by course.'
            : 'No class times yet — add them from a course page to see your weekly schedule.'}
        </p>
      )}

      {/* Calendar — flex-1 so it fills the remaining height */}
      {!hasError && (
      <div className="flex-1 min-h-0">
        <Calendar<CalEvent>
          localizer={localizer}
          culture="en-US"
          events={events}
          date={calDate}
          view={calView}
          views={mode === 'lectures' ? ['week', 'day'] : ['month', 'week']}
          onNavigate={setCalDate}
          onView={v => setCalView(v as CalendarView)}
          onRangeChange={handleRangeChange}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          // Week/day open at the school day rather than at 12:00 AM — the stock
          // scroll position put eight empty overnight hours on screen first.
          scrollToTime={WEEK_VIEW_SCROLL_TO}
          style={{ height: '100%' }}
          popup
          showMultiDayTimes
        />
      </div>
      )}

      {selected && (
        <EventPopover
          event={selected.event}
          anchor={selected.anchor}
          onClose={() => setSelected(null)}
          onEditAssignment={setEditingAssignment}
          onEditTask={setEditingTask}
          onOpenLectureNotes={(meeting, course, date) => setLectureSel({ meeting, course, date })}
          onToggleStudyBlock={toggleStudyBlock}
          studyBlockPending={updateStudyBlock.isPending}
        />
      )}

      {editingAssignment && (
        <AddAssignmentDialog
          courseId={editingAssignment.course_id}
          assignment={editingAssignment}
          isOpen
          onClose={() => setEditingAssignment(null)}
        />
      )}

      {editingTask && (
        <AddTaskDialog
          task={editingTask}
          isOpen
          onClose={() => setEditingTask(null)}
        />
      )}

      {lectureSel && (
        <LectureNotesDialog
          meeting={lectureSel.meeting}
          course={lectureSel.course}
          date={lectureSel.date}
          onClose={() => setLectureSel(null)}
        />
      )}
    </div>
  );
}
