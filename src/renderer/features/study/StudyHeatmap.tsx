import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import type { StudySession } from '../../../shared/types';
import {
  buildHeatmap,
  currentStreak,
  totalFocusMinutes,
  focusMinutesSince,
  startOfDay,
  addDays,
  type HeatmapCell,
} from '../../../shared/studyStats';
import { cn } from '../../lib/utils';

const WEEKS = 53;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']; // GitHub shows every other row
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Intensity shades blend the Lamplight Amber accent into the inset well, so the
// scale reads as "more lamplight = more focus" and tracks the theme automatically.
function levelStyle(level: 0 | 1 | 2 | 3 | 4): React.CSSProperties {
  if (level === 0) return { backgroundColor: 'var(--inset)' };
  const pct = [0, 28, 50, 74, 100][level];
  return { backgroundColor: `color-mix(in srgb, var(--accent) ${pct}%, var(--inset))` };
}

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return `${Math.round(minutes)} min`;
  return `${h % 1 === 0 ? h : h.toFixed(1)} h`;
}

function cellTitle(cell: HeatmapCell): string {
  const date = cell.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (cell.future) return date;
  const mins = Math.round(cell.minutes);
  return mins === 0 ? `No focus time · ${date}` : `${hoursLabel(cell.minutes)} focused · ${date}`;
}

interface Props {
  sessions: StudySession[];
  /** Compact = smaller cells, no stat header (for tucking into Focus Mode if wanted). */
  compact?: boolean;
}

/** A GitHub-contributions-style grid of focus time, plus streak/total stat chips. */
export default function StudyHeatmap({ sessions, compact = false }: Props) {
  const now = new Date();
  const grid = useMemo(() => buildHeatmap(sessions, WEEKS, now), [sessions]);

  const stats = useMemo(() => {
    const weekStart = addDays(startOfDay(now), -now.getDay());
    return {
      streak:  currentStreak(sessions, now),
      total:   totalFocusMinutes(sessions),
      thisWeek: focusMinutesSince(sessions, weekStart),
    };
  }, [sessions]);

  // Month labels sit above the first column of each month.
  const monthLabels = grid.map((week, i) => {
    const firstOfMonth = week[0];
    const prev = grid[i - 1]?.[0];
    const show = i === 0 ? false : firstOfMonth.date.getMonth() !== prev?.date.getMonth();
    return show ? MONTHS[firstOfMonth.date.getMonth()] : '';
  });

  const cellSize = compact ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const gap = compact ? 'gap-[3px]' : 'gap-1';

  return (
    <div>
      {!compact && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat value={stats.streak} unit="day streak" flame={stats.streak > 0} />
          <Stat value={hoursLabel(stats.thisWeek)} unit="this week" />
          <Stat value={hoursLabel(stats.total)} unit="all time" />
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels */}
          <div className={cn('flex pl-8', gap)}>
            {monthLabels.map((label, i) => (
              <div key={i} className={cn(cellSize, 'shrink-0 text-[0.6rem] text-muted')}>
                {label && <span className="relative -left-px whitespace-nowrap">{label}</span>}
              </div>
            ))}
          </div>

          <div className="flex gap-1">
            {/* Weekday labels */}
            <div className={cn('flex w-7 shrink-0 flex-col pr-1', gap)}>
              {DAY_LABELS.map((d, i) => (
                <div key={i} className={cn(cellSize, 'flex items-center justify-end text-[0.6rem] leading-none text-muted')}>
                  {d}
                </div>
              ))}
            </div>

            {/* The grid: one flex column per week */}
            <div className={cn('flex', gap)}>
              {grid.map((week, wi) => (
                <div key={wi} className={cn('flex flex-col', gap)}>
                  {week.map(cell => (
                    <div
                      key={cell.key}
                      title={cellTitle(cell)}
                      className={cn(cellSize, 'shrink-0 rounded-sm', cell.future && 'opacity-0')}
                      style={cell.future ? undefined : levelStyle(cell.level)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 pt-1 text-[0.6rem] text-muted">
            <span>Less</span>
            {([0, 1, 2, 3, 4] as const).map(l => (
              <div key={l} className={cn(cellSize, 'rounded-sm')} style={levelStyle(l)} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, unit, flame = false }: { value: string | number; unit: string; flame?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      {flame && <Flame size={15} className="self-center text-accent" fill="currentColor" />}
      <span className="text-xl font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-xs text-muted">{unit}</span>
    </div>
  );
}
