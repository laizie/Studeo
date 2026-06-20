import { useState, useEffect } from 'react';
import { ChevronDown, Calculator, Plus, X } from 'lucide-react';
import type { Course, GradeSection } from '../../../shared/types';
import {
  parseGradeSections,
  computeSectionStanding,
  computeTargetGrade,
  formatPercent,
} from '../../../shared/grades';
import { useUpdateCourse } from '../../lib/queries/useCourses';
import { cn } from '../../lib/utils';

interface Props {
  course: Course;
}

// A draft row keeps weight/score as strings so the inputs can be blank.
interface Row {
  id: string;
  name: string;
  weight: string;
  score: string;
}

const NUM_INPUT =
  'w-16 px-2 py-1.5 text-sm text-right border border-line rounded-lg bg-white dark:bg-inset ' +
  'text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted';

// Flexible variant for the weight/score fields so they share the row and shrink
// to fit the narrow column instead of overflowing (the card clips overflow).
const FIELD_INPUT =
  'w-full min-w-0 px-2 py-1.5 text-sm text-right border border-line rounded-lg bg-white dark:bg-inset ' +
  'text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted';

const NAME_INPUT =
  'flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-line rounded-lg bg-white dark:bg-inset ' +
  'text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted';

function rowsFromRaw(raw: string | null): Row[] {
  return parseGradeSections(raw).map(s => ({
    id: s.id,
    name: s.name,
    weight: String(s.weight),
    score: s.score === null ? '' : String(s.score),
  }));
}

function newRow(): Row {
  return { id: crypto.randomUUID(), name: '', weight: '', score: '' };
}

// Custom grade sections (Exam 1, Exam 2, Final, Homework …): set each one's
// weight, type your score as you get it, and see your current grade + what you
// need on the rest to hit a target. Replaces the old fixed-type weights.
export default function GradeSectionsCard({ course }: Props) {
  const savedRaw = course.grade_weights;
  const [rows, setRows] = useState<Row[]>(() => rowsFromRaw(savedRaw));
  const [open, setOpen] = useState(rowsFromRaw(savedRaw).length > 0);
  const [target, setTarget] = useState('90');

  const updateCourse = useUpdateCourse();

  // Re-sync the draft when the saved sections change (e.g. after a save, or an
  // edit from another view). Only fires when grade_weights itself changes, so it
  // never clobbers an in-progress edit.
  useEffect(() => {
    setRows(rowsFromRaw(savedRaw));
  }, [savedRaw]);

  function updateRow(id: string, field: 'name' | 'weight' | 'score', value: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRow()           { setRows(prev => [...prev, newRow()]); }
  function removeRow(id: string) { setRows(prev => prev.filter(r => r.id !== id)); }

  // Valid sections parsed from the draft — drives both the live calc and the save.
  const sections: GradeSection[] = rows
    .filter(r => r.name.trim() && r.weight.trim() !== '' && Number.isFinite(Number(r.weight)) && Number(r.weight) > 0)
    .map(r => ({
      id: r.id,
      name: r.name.trim(),
      weight: Number(r.weight),
      score: r.score.trim() === '' ? null : Number(r.score),
    }));

  // Light client-side validation (the IPC handler re-checks).
  const invalid = rows.some(r => {
    const hasName = r.name.trim() !== '';
    const w = Number(r.weight);
    const s = Number(r.score);
    if (r.weight.trim() !== '' && (!Number.isFinite(w) || w < 0 || w > 100)) return true;
    if (r.score.trim() !== '' && (!Number.isFinite(s) || s < 0 || s > 150)) return true;
    if (!hasName && (r.weight.trim() !== '' || r.score.trim() !== '')) return true; // incomplete row
    return false;
  });

  const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0);
  const standing = computeSectionStanding(sections);
  const targetNum = target.trim() === '' ? NaN : Number(target);
  const result =
    sections.length > 0 && Number.isFinite(targetNum)
      ? computeTargetGrade(standing.currentPercent ?? 0, standing.remainingWeightPct, targetNum)
      : null;

  function handleSave() {
    if (invalid) return;
    updateCourse.mutate({
      id: course.id,
      input: { gradeSections: sections.length > 0 ? sections : null },
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
          <Calculator size={14} className="text-muted" />
          <span className="text-sm font-semibold text-ink-soft">Grade sections</span>
        </div>
        <ChevronDown size={15} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-line p-4 space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            Break your grade into the sections from your syllabus (Exam 1, Final, Homework…).
            Set each weight and type your score as you get it — blank means not taken yet.
          </p>

          {/* Rows — each section is its own block: name on top, weight + score below */}
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row.id} className="rounded-lg border border-line p-2.5 space-y-2">
                {/* Name + remove */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={e => updateRow(row.id, 'name', e.target.value)}
                    placeholder="e.g. Exam 1"
                    aria-label="Section name"
                    className={NAME_INPUT}
                  />
                  <button
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove ${row.name || 'section'}`}
                    className="p-1 text-muted hover:text-red-500 rounded transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
                {/* Weight + score — each flexes to share the row so they never overflow */}
                <div className="flex items-center gap-3 pl-2">
                  <label className="flex flex-1 min-w-0 items-center gap-1.5">
                    <span className="text-xs text-muted shrink-0">Weight</span>
                    <input
                      type="number"
                      value={row.weight}
                      onChange={e => updateRow(row.id, 'weight', e.target.value)}
                      min={0}
                      max={100}
                      placeholder="—"
                      aria-label={`${row.name || 'Section'} weight percent`}
                      className={FIELD_INPUT}
                    />
                    <span className="text-xs text-muted shrink-0">%</span>
                  </label>
                  <label className="flex flex-1 min-w-0 items-center gap-1.5">
                    <span className="text-xs text-muted shrink-0">Score</span>
                    <input
                      type="number"
                      value={row.score}
                      onChange={e => updateRow(row.id, 'score', e.target.value)}
                      min={0}
                      placeholder="—"
                      aria-label={`${row.name || 'Section'} score percent`}
                      className={FIELD_INPUT}
                    />
                    <span className="text-xs text-muted shrink-0">%</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-ink-soft transition-colors"
          >
            <Plus size={14} />
            Add section
          </button>

          {/* Total + save */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p
              className={cn(
                'text-xs',
                sections.length === 0 ? 'text-muted'
                  : totalWeight === 100 ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {sections.length === 0
                ? 'No sections yet'
                : `Total weight: ${formatPercent(totalWeight)}${totalWeight !== 100 ? ' — most syllabi add to 100' : ''}`}
            </p>
            <button
              onClick={handleSave}
              disabled={invalid || updateCourse.isPending}
              className="shrink-0 px-3 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updateCourse.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Grade + target calculator */}
          {sections.length > 0 && (
            <div className="border-t border-line pt-3 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Current grade</span>
                <span className="text-lg font-semibold text-ink tabular-nums">
                  {standing.currentPercent === null ? '—' : formatPercent(standing.currentPercent)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-soft">Target grade</span>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    min={0}
                    placeholder="—"
                    aria-label="Target grade percent"
                    className={NUM_INPUT}
                  />
                  <span className="text-xs text-muted w-2.5">%</span>
                </div>
              </div>

              {result && (
                <div className="rounded-lg bg-inset border border-line px-3 py-2.5 text-sm">
                  {result.status === 'reachable' && (
                    <p className="text-ink-soft">
                      Average{' '}
                      <span className="font-semibold text-ink">{formatPercent(result.neededAverage)}</span>{' '}
                      on the remaining {formatPercent(standing.remainingWeightPct)} to finish at{' '}
                      {formatPercent(targetNum)}.
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
                      Every section is scored — your final grade is{' '}
                      <span className="font-semibold text-ink">
                        {standing.currentPercent === null ? '—' : formatPercent(standing.currentPercent)}
                      </span>.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
