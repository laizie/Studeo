import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import type { Assignment, Course } from '../../../shared/types';
import { computeDeadlineLabel } from '../../../shared/deadlines';
import { selectUpcomingExams, type UpcomingExam } from '../../../shared/exams';
import { courseInk, coursePillBg } from '../../lib/colors';
import { URGENCY_CLASS } from '../../lib/urgency';
import { cn } from '../../lib/utils';
import PlanStudyDialog from '../study/PlanStudyDialog';

/** Beyond this the card stops being a glance; the rest live on the calendar. */
const VISIBLE = 5;

interface Props {
  /** Term-scoped, same set the rest of the Dashboard works from. */
  assignments: Assignment[];
  courses: Course[];
  /** Local midnight from useToday(), so the list rolls over at midnight. */
  today: Date;
  onEdit: (a: Assignment) => void;
}

function ExamRow({ exam, onEdit, onPlan }: {
  exam: UpcomingExam;
  onEdit: (a: Assignment) => void;
  onPlan: (e: UpcomingExam) => void;
}) {
  const { assignment, course, dayLabel, timeLabel } = exam;
  const deadline = computeDeadlineLabel(assignment.due_date);

  return (
    <div className="group relative px-3 py-2 hover:bg-surface-hi transition-colors">
      <div className="flex items-center gap-2">
        {course && (
          // z-10 keeps the course jump clickable above the stretched row button.
          <Link
            to={`/courses/${course.id}`}
            title={`Open ${course.name}`}
            className="relative z-10 shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            style={{ backgroundColor: coursePillBg(course.color), color: courseInk(course.color) }}
          >
            {course.abbreviation}
          </Link>
        )}
        {/* Stretched button: the whole row opens the edit dialog — which is also
            where a missing exam time gets filled in. Sibling of the plan button,
            never its parent. */}
        <button
          type="button"
          onClick={() => onEdit(assignment)}
          className="flex-1 min-w-0 truncate text-left text-sm font-medium text-ink-soft rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted"
        >
          {assignment.name}
        </button>
        <button
          onClick={() => onPlan(exam)}
          aria-label={`Plan study sessions for ${assignment.name}`}
          title="Plan study sessions"
          className="relative z-10 shrink-0 p-1 rounded text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CalendarPlus size={13} />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted truncate tabular-nums">
          {dayLabel}
          {timeLabel && <> · {timeLabel}</>}
        </span>
        <span className={cn('text-xs font-medium shrink-0 px-2 py-0.5 rounded', URGENCY_CLASS[deadline.urgency])}>
          {deadline.label}
        </span>
      </div>
    </div>
  );
}

/**
 * Exams, always on screen — not windowed to this week like everything else on the
 * Dashboard. A midterm three weeks out is the thing you want to know about in
 * week one, and the day alone isn't enough: an 8 AM exam and a 4 PM exam are
 * different days, so each row carries its time when one is set.
 */
export default function UpcomingExamsCard({ assignments, courses, today, onEdit }: Props) {
  const [planning, setPlanning] = useState<UpcomingExam | undefined>();

  const { exams, hiddenCount } = useMemo(
    () => selectUpcomingExams(assignments, courses, today, { limit: VISIBLE }),
    [assignments, courses, today],
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Exams</h2>
        {exams.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-surface text-muted tabular-nums">
            {exams.length + hiddenCount}
          </span>
        )}
      </div>

      {exams.length === 0 ? (
        <p className="px-3 text-sm text-muted">
          No exams ahead. They'll show up here as soon as one's on the books.
        </p>
      ) : (
        <>
          <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
            <div className="divide-y divide-line">
              {exams.map(e => (
                <ExamRow
                  key={e.assignment.id}
                  exam={e}
                  onEdit={onEdit}
                  onPlan={setPlanning}
                />
              ))}
            </div>
          </div>
          {hiddenCount > 0 && (
            <Link
              to="/calendar"
              className="mt-2 inline-block px-3 text-xs text-muted underline hover:text-ink transition-colors"
            >
              {hiddenCount} more on the calendar →
            </Link>
          )}
        </>
      )}

      {planning && (
        <PlanStudyDialog
          assignment={planning.assignment}
          course={planning.course}
          onClose={() => setPlanning(undefined)}
        />
      )}
    </div>
  );
}
