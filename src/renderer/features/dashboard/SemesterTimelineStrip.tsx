import { Link } from 'react-router-dom';
import { buildSemesterTimeline } from '../../../shared/semesterTimeline';
import { formatDueDate } from '../../../shared/deadlines';
import type { Assignment, Course, Term } from '../../../shared/types';
import { cn } from '../../lib/utils';

interface Props {
  /** The currently selected term; the strip only renders when it has dates. */
  term: Term | undefined;
  /** Courses already scoped to the term. */
  courses: Course[];
  assignments: Assignment[];
}

// Left gutter that lines up the ruler, course labels, and load row.
const GUTTER = 'w-20 shrink-0';

/**
 * One horizontal bar per course across the whole term, with a dot per assignment
 * (diamonds for exams/projects) and a per-week load histogram — so in week 1 you
 * can already see the week-11 pileup. Purely derived from term/course/assignment
 * data via buildSemesterTimeline().
 */
export default function SemesterTimelineStrip({ term, courses, assignments }: Props) {
  const t = buildSemesterTimeline(term, courses, assignments);
  if (!t || t.courses.length === 0) return null;

  // Half a week as a fraction — used to center week bars/labels in their slot.
  const halfWeek = 3.5 / t.totalDays;
  // Label every 4th week so the ruler stays readable.
  const labelWeeks = t.weeks.filter(w => (w.index - 1) % 4 === 0);

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">This semester</h2>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" /> assignment
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rotate-45 rounded-[2px] bg-muted" /> exam / project
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        {/* Week ruler */}
        <div className="flex items-center">
          <div className={GUTTER} />
          <div className="relative h-4 flex-1">
            {t.weeks.map(w => (
              <div
                key={w.index}
                className="absolute bottom-0 top-2 w-px bg-line/70"
                style={{ left: `${w.startPosition * 100}%` }}
              />
            ))}
            {labelWeeks.map(w => (
              <span
                key={w.index}
                className="absolute top-0 -translate-x-1/2 text-[10px] text-muted"
                style={{ left: `${Math.min(w.startPosition + halfWeek, 1) * 100}%` }}
              >
                W{w.index}
              </span>
            ))}
            {t.todayPosition !== null && (
              <div className="absolute inset-y-0 w-px bg-red-400" style={{ left: `${t.todayPosition * 100}%` }} />
            )}
          </div>
        </div>

        {/* One bar per course */}
        <div className="mt-1.5 space-y-1.5">
          {t.courses.map(row => (
            <div key={row.id} className="flex items-center">
              <Link
                to={`/courses/${row.id}`}
                title={row.name}
                className={cn(GUTTER, 'flex items-center gap-1.5 truncate pr-2 text-xs font-medium text-ink-soft hover:text-ink')}
              >
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="truncate">{row.abbreviation}</span>
              </Link>
              <div className="relative h-6 flex-1">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-inset" />
                {t.todayPosition !== null && (
                  <div className="absolute inset-y-0 w-px bg-red-400/50" style={{ left: `${t.todayPosition * 100}%` }} />
                )}
                {/* Draw majors last so their diamonds sit on top of nearby dots. */}
                {[...row.markers]
                  .sort((a, b) => Number(a.major) - Number(b.major))
                  .map(m => (
                    <span
                      key={m.id}
                      title={`${m.name} · ${m.type} · ${formatDueDate(m.dueDate)}`}
                      className={cn(
                        'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border border-surface',
                        m.major ? 'h-2.5 w-2.5 rotate-45 rounded-[2px]' : 'h-2 w-2 rounded-full',
                        m.completed && 'opacity-40',
                      )}
                      style={{ left: `${m.position * 100}%`, backgroundColor: row.color }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Per-week load histogram — the pileup at a glance */}
        <div className="mt-2 flex items-end">
          <div className={cn(GUTTER, 'pr-2 text-right text-[10px] text-muted')}>Load</div>
          <div className="relative h-8 flex-1">
            {t.weeks.map(w => {
              const heightPct = t.maxWeekCount > 0 ? (w.count / t.maxWeekCount) * 100 : 0;
              return (
                <div
                  key={w.index}
                  className="absolute bottom-0 -translate-x-1/2"
                  style={{ left: `${Math.min(w.startPosition + halfWeek, 1) * 100}%` }}
                >
                  <div
                    className={cn('w-2 rounded-t', w.isPeak ? 'bg-amber-400' : 'bg-line')}
                    style={{ height: w.count > 0 ? `${Math.max(heightPct * 0.28, 4)}px` : '0px' }}
                    title={`Week ${w.index}: ${w.count} due`}
                  />
                </div>
              );
            })}
            {t.todayPosition !== null && (
              <div className="absolute inset-y-0 w-px bg-red-400/50" style={{ left: `${t.todayPosition * 100}%` }} />
            )}
          </div>
        </div>

        {t.peakWeekIndex !== null && t.maxWeekCount >= 2 && (
          <p className="mt-2 pl-20 text-[11px] text-muted">
            Heaviest week: <span className="font-medium text-ink-soft">Week {t.peakWeekIndex}</span> · {t.maxWeekCount} due
          </p>
        )}
      </div>
    </section>
  );
}
