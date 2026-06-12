import { useState, useEffect } from 'react';
import { ChevronDown, Percent } from 'lucide-react';
import type { Course, AssignmentType } from '../../../shared/types';
import { ASSIGNMENT_TYPES } from '../../../shared/types';
import { parseGradeWeights } from '../../../shared/grades';
import { useUpdateCourse } from '../../lib/queries/useCourses';
import { cn } from '../../lib/utils';

interface Props {
  course: Course;
}

// Editor for the course's grading scheme ("Homework 30%, Exams 40%…").
// Leave everything blank to grade by straight points instead.
export default function GradeWeightsCard({ course }: Props) {
  const saved = parseGradeWeights(course.grade_weights);
  const hasScheme = Object.keys(saved).length > 0;

  const [open, setOpen] = useState(hasScheme);
  // Inputs are strings so they can be blank; keyed by assignment type.
  const [draft, setDraft] = useState<Record<AssignmentType, string>>(() => fromSaved());

  const updateCourse = useUpdateCourse();

  function fromSaved(): Record<AssignmentType, string> {
    return Object.fromEntries(
      ASSIGNMENT_TYPES.map(t => [t, saved[t]?.toString() ?? ''])
    ) as Record<AssignmentType, string>;
  }

  // Re-sync the draft when another screen changes the course row.
  const savedRaw = course.grade_weights;
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        ASSIGNMENT_TYPES.map(t => [t, parseGradeWeights(savedRaw)[t]?.toString() ?? ''])
      ) as Record<AssignmentType, string>
    );
  }, [savedRaw]);

  const entries = ASSIGNMENT_TYPES
    .map(t => ({ type: t, value: Number(draft[t]) }))
    .filter(e => draft[e.type] !== '' && Number.isFinite(e.value) && e.value > 0);
  const total = entries.reduce((sum, e) => sum + e.value, 0);

  const invalid = ASSIGNMENT_TYPES.some(t => {
    const raw = draft[t];
    if (raw === '') return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0 || n > 100;
  });

  function handleSave() {
    if (invalid) return;
    const weights = Object.fromEntries(entries.map(e => [e.type, e.value]));
    updateCourse.mutate({
      id: course.id,
      input: { gradeWeights: entries.length > 0 ? weights : null },
    });
  }

  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hi transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Percent size={14} className="text-muted" />
          <span className="text-sm font-semibold text-ink-soft">Grade weights</span>
        </div>
        <ChevronDown
          size={15}
          className={cn('text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-line">
          <p className="text-xs text-muted leading-relaxed px-4 pt-3 pb-2">
            How much each type counts toward the course grade. Leave blank to
            grade by total points instead.
          </p>

          <div className="divide-y divide-line">
            {ASSIGNMENT_TYPES.map(t => (
              <label key={t} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-surface-hi transition-colors">
                <span className="text-sm text-ink-soft">{t}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    value={draft[t]}
                    onChange={e => setDraft(prev => ({ ...prev, [t]: e.target.value }))}
                    min={0}
                    max={100}
                    placeholder="—"
                    aria-label={`${t} weight percent`}
                    className="w-16 px-2 py-1.5 text-sm text-right border border-line rounded-lg bg-white dark:bg-inset text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted"
                  />
                  <span className="text-sm text-muted w-3">%</span>
                </div>
              </label>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-line space-y-2">
            <p
              className={cn(
                'text-xs',
                entries.length === 0 ? 'text-muted'
                  : total === 100 ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {entries.length === 0
                ? 'Grading by points'
                : `Total: ${total}%${total !== 100 ? ' — most syllabi add to 100' : ''}`}
            </p>
            {invalid && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Weights must be numbers between 0 and 100.
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={invalid || updateCourse.isPending}
              className="w-full px-3 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updateCourse.isPending ? 'Saving…' : 'Save weights'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
