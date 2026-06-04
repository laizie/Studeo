import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { parseDateLocal } from '../../../shared/deadlines';
import type { Assignment, ClassMeeting, Course } from '../../../shared/types';
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

type CalEvent = AssignmentEvent | MeetingEvent;

// ── Helpers ───────────────────────────────────────────────────────────────────

function expandMeetingsForRange(
  meetings: ClassMeeting[],
  courseMap: Map<string, Course>,
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
        const [sh, sm] = m.start_time.split(':').map(Number);
        const [eh, em] = m.end_time.split(':').map(Number);
        const course = courseMap.get(m.course_id);
        events.push({
          title: m.location
            ? `${course?.abbreviation ?? '?'} — ${m.location}`
            : (course?.abbreviation ?? '?'),
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
type Mode = 'assignments' | 'lectures';

export default function CalendarPage() {
  const navigate = useNavigate();
  const { data: courses }     = useCourses();
  const { data: assignments }  = useAssignments();
  const { data: allMeetings }  = useClassMeetings();

  const [mode, setMode] = useState<Mode>('assignments');
  const [calDate, setCalDate] = useState(new Date());
  const [calView, setCalView] = useState<View>('month');

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
    return expandMeetingsForRange(allMeetings, courseMap, visibleRange.start, visibleRange.end);
  }, [allMeetings, courseMap, visibleRange]);

  const events: CalEvent[] = mode === 'assignments' ? assignmentEvents : lectureEvents;

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
      }
    },
    [navigate]
  );

  const eventPropGetter = useCallback((event: CalEvent) => {
    const color = event.resource.course?.color ?? '#6393e1';
    const isCompleted =
      event.resource.type === 'assignment' &&
      event.resource.assignment.status === 'completed';
    return {
      style: {
        backgroundColor: isCompleted ? '#d6d3d1' : color,
        borderColor:     isCompleted ? '#a8a29e' : color,
        color: 'white',
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
        <h1 className="text-2xl font-semibold text-stone-800">Calendar</h1>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
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
                  ? 'bg-white text-stone-800 shadow-sm font-medium'
                  : 'text-stone-500 hover:text-stone-700'
              )}
            >
              {m === 'assignments' ? 'Assignments' : 'Lecture Schedule'}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar — flex-1 so it fills the remaining height */}
      <div className="flex-1 min-h-0">
        <Calendar<CalEvent>
          localizer={localizer}
          culture="en-US"
          events={events}
          date={calDate}
          view={calView}
          views={mode === 'lectures' ? ['week', 'day'] : ['month']}
          onNavigate={setCalDate}
          onView={v => setCalView(v)}
          onRangeChange={handleRangeChange}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          style={{ height: '100%' }}
          popup
          showMultiDayTimes
        />
      </div>
    </div>
  );
}
