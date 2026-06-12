import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { View } from 'react-big-calendar';
import { usePageFiltersStore, type CalendarMode, type CalendarView } from '../../store/usePageFiltersStore';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useMeetingExceptions } from '../../lib/queries/useMeetingExceptions';
import { buildExceptionIndex, resolveOccurrence, type ExceptionIndex } from '../../../shared/meetingExceptions';
import { useTasks } from '../../lib/queries/useTasks';
import { parseDateLocal } from '../../../shared/deadlines';
import type { Assignment, ClassMeeting, Course, Task } from '../../../shared/types';
import { contrastTextColor } from '../../lib/colors';
import QueryErrorState from '../../components/QueryErrorState';
import { cn } from '../../lib/utils';

// ── Localizer ────────────────────────────────────────────────────────────────
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
});

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

type CalEvent = AssignmentEvent | MeetingEvent | TaskEvent;

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

// ── Component ─────────────────────────────────────────────────────────────────
type Mode = CalendarMode;

export default function CalendarPage() {
  const navigate = useNavigate();
  const { data: courses,     isError: coursesError,     refetch: refetchCourses     } = useCourses();
  const { data: assignments, isError: assignmentsError, refetch: refetchAssignments } = useAssignments();
  const { data: allMeetings, isError: meetingsError,    refetch: refetchMeetings    } = useClassMeetings();
  const { data: exceptions }   = useMeetingExceptions();
  const { data: tasks }        = useTasks();

  const hasError = coursesError || assignmentsError || meetingsError;

  const mode                = usePageFiltersStore(s => s.calendarMode);
  const setMode             = usePageFiltersStore(s => s.setCalendarMode);
  const calView             = usePageFiltersStore(s => s.calendarView) as View;
  const setCalView          = usePageFiltersStore(s => s.setCalendarView);
  const calendarShowTasks   = usePageFiltersStore(s => s.calendarShowTasks);
  const setCalendarShowTasks = usePageFiltersStore(s => s.setCalendarShowTasks);
  const [calDate, setCalDate] = useState(new Date());

  // Track the visible range so we only expand meetings for what's on screen.
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>(() => ({
    start: startOfMonth(new Date()),
    end:   endOfMonth(new Date()),
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
      return {
        title: course ? `[${course.abbreviation}] ${a.name}` : a.name,
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

  const events: CalEvent[] = useMemo(() => {
    const base: CalEvent[] = mode === 'assignments' ? assignmentEvents : lectureEvents;
    if (mode === 'assignments' && calendarShowTasks) {
      return [...base, ...taskEvents];
    }
    return base;
  }, [mode, assignmentEvents, lectureEvents, taskEvents, calendarShowTasks]);

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

  const handleSelectEvent = useCallback(
    (event: CalEvent) => {
      if (event.resource.type === 'assignment' && event.resource.course) {
        navigate(`/courses/${event.resource.course.id}`);
      } else if (event.resource.type === 'task') {
        navigate('/tasks');
      }
    },
    [navigate]
  );

  const eventPropGetter = useCallback((event: CalEvent) => {
    if (event.resource.type === 'task') {
      const done = event.resource.task.status === 'completed';
      const bg = done ? '#d6d3d1' : '#7c6abf';
      return {
        style: {
          backgroundColor: bg,
          borderColor:     done ? '#a8a29e' : '#6b59b0',
          // Text color follows the chip background — pastel course colors and
          // the completed gray are unreadable with hard-coded white.
          color: contrastTextColor(bg),
          borderRadius: '4px',
          opacity: done ? 0.65 : 1,
          fontSize: '0.75rem',
        },
      };
    }
    const color = event.resource.course?.color ?? '#6393e1';
    const isCompleted =
      event.resource.type === 'assignment' &&
      event.resource.assignment.status === 'completed';
    const bg = isCompleted ? '#d6d3d1' : color;
    return {
      style: {
        backgroundColor: bg,
        borderColor:     isCompleted ? '#a8a29e' : color,
        color: contrastTextColor(bg),
        borderRadius: '4px',
        opacity: isCompleted ? 0.65 : 1,
        fontSize: '0.75rem',
      },
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 flex flex-col" style={{ height: 'calc(100vh - 40px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <h1 className="text-2xl font-semibold text-ink">Calendar</h1>

        <div className="flex items-center gap-3">
          {/* Tasks toggle — only meaningful in Assignments mode */}
          {mode === 'assignments' && (
            <button
              onClick={() => setCalendarShowTasks(!calendarShowTasks)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-line bg-inset text-stone-600 dark:text-muted hover:bg-surface-hi transition-colors"
            >
              <span className={cn(
                'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200',
                calendarShowTasks ? 'bg-[#7c6abf]' : 'bg-stone-300 dark:bg-surface'
              )}>
                <span className={cn(
                  'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200',
                  calendarShowTasks ? 'translate-x-3.5' : 'translate-x-0.5'
                )} />
              </span>
              Tasks
            </button>
          )}

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-inset rounded-lg">
            {(['assignments', 'lectures'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setCalView(m === 'lectures' ? 'week' : 'month');
                }}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors capitalize',
                  mode === m
                    ? 'bg-surface text-ink shadow-sm font-medium'
                    : ' text-stone-600 dark:text-muted hover:bg-stone-200 dark:hover:bg-surface-hi'
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
          views={mode === 'lectures' ? ['week', 'day'] : ['month']}
          onNavigate={setCalDate}
          onView={v => setCalView(v as CalendarView)}
          onRangeChange={handleRangeChange}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          style={{ height: '100%' }}
          popup
          showMultiDayTimes
        />
      </div>
      )}
    </div>
  );
}
