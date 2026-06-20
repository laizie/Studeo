import { useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import type { Course } from '../../../shared/types';
import {
  parseGradeWeights,
  remainingWeightShare,
  computeTargetGrade,
  formatPercent,
  type CourseStanding,
} from '../../../shared/grades';
import { cn } from '../../lib/utils';

interface Props {
  course: Course;
  /** Already computed by the course page — reused so the numbers can't disagree. */
  standing: CourseStanding;
}

const NUM_INPUT =
  'w-16 px-2 py-1.5 text-sm text-right border border-line rounded-lg bg-white dark:bg-inset ' +
  'text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted';

const TARGET_PRESETS = [70, 80, 90, 93];

// Round to one decimal for a clean prefill string ('' when there's nothing yet).
function prefill(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 10) / 10);
}

// "What do I need on the rest of the course to finish at my target?" — the
// inverse of the current-standing math, prefilled from the course's scheme.
export default function TargetGradeCard({ course, standing }: Props) {
  const weights = parseGradeWeights(course.grade_weights);
  const gradedTypes = standing.breakdown.map(b => b.type);
  const gradedSet = new Set<string>(gradedTypes);
  const remainingTypes = Object.keys(weights).filter(t => !gradedSet.has(t));

  // Prefills, recomputed from live props each render.
  const currentPrefill   = prefill(standing.percent);
  const remainingPrefill = prefill(remainingWeightShare(weights, gradedTypes));

  const [open, setOpen] = useState(standing.gradedCount > 0);

  // null = follow the live prefill; a string = the user typed their own value.
  const [currentOverride, setCurrentOverride]     = useState<string | null>(null);
  const [remainingOverride, setRemainingOverride] = useState<string | null>(null);
  const [target, setTarget] = useState('90');

  const currentStr   = currentOverride   ?? currentPrefill;
  const remainingStr = remainingOverride ?? remainingPrefill;

  const currentNum   = currentStr.trim()   === '' ? 0      : Number(currentStr);
  const remainingNum = remainingStr.trim() === '' ? NaN    : Number(remainingStr);
  const targetNum    = target.trim()       === '' ? NaN    : Number(target);

  const ready =
    Number.isFinite(remainingNum) && Number.isFinite(targetNum) && Number.isFinite(currentNum);
  const result = ready ? computeTargetGrade(currentNum, remainingNum, targetNum) : null;

  // Show the scheme note only while the remaining-weight field is still the
  // auto-derived value (not a manual override) and there's an ungraded category.
  const showSchemeNote =
    remainingOverride === null && remainingPrefill !== '' && remainingTypes.length > 0;

  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hi transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-muted" />
          <span className="text-sm font-semibold text-ink-soft">Target grade</span>
        </div>
        <ChevronDown size={15} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-line p-4 space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            What you need on the rest of the course to finish where you want.
          </p>

          {/* Inputs */}
          <div className="space-y-2">
            <Field label="Current grade">
              <input
                type="number"
                value={currentStr}
                onChange={e => setCurrentOverride(e.target.value)}
                min={0}
                placeholder="—"
                aria-label="Current grade percent"
                className={NUM_INPUT}
              />
            </Field>
            <Field label="Still ungraded">
              <input
                type="number"
                value={remainingStr}
                onChange={e => setRemainingOverride(e.target.value)}
                min={0}
                max={100}
                placeholder="—"
                aria-label="Weight of remaining work, percent of grade"
                className={NUM_INPUT}
              />
            </Field>
            <Field label="Target grade">
              <input
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                min={0}
                placeholder="—"
                aria-label="Target grade percent"
                className={NUM_INPUT}
              />
            </Field>
          </div>

          {/* Target quick-set chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted mr-0.5">Aim for</span>
            {TARGET_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setTarget(String(p))}
                className={cn(
                  'px-2 py-0.5 text-xs rounded-md border transition-colors',
                  Number(target) === p
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-line text-muted hover:bg-surface-hi',
                )}
              >
                {p}%
              </button>
            ))}
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-lg bg-inset border border-line px-3 py-2.5 text-sm">
              {result.status === 'reachable' && (
                <p className="text-ink-soft">
                  Average{' '}
                  <span className="font-semibold text-ink">{formatPercent(result.neededAverage)}</span>{' '}
                  on the remaining {formatPercent(remainingNum)} to finish at {formatPercent(targetNum)}.
                </p>
              )}
              {result.status === 'secured' && (
                <p className="text-green-600 dark:text-green-400">
                  You've already secured {formatPercent(targetNum)} — even a 0 on the rest keeps you there.
                </p>
              )}
              {result.status === 'impossible' && (
                <p className="text-amber-600 dark:text-amber-400">
                  That needs more than 100% on what's left — not reachable without extra credit.
                </p>
              )}
              {result.status === 'locked' && (
                <p className="text-ink-soft">
                  Nothing left ungraded — your grade is{' '}
                  <span className="font-semibold text-ink">{formatPercent(currentNum)}</span>.
                </p>
              )}
            </div>
          )}

          {showSchemeNote && (
            <p className="text-[11px] text-muted leading-relaxed">
              Counting {remainingTypes.join(', ')} as what's left; assumes your graded categories
              finish at their current average.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// A labeled row with a right-aligned input + trailing "%".
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-soft">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {children}
        <span className="text-sm text-muted w-3">%</span>
      </div>
    </label>
  );
}
