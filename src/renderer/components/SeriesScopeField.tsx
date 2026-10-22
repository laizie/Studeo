import type { ReactNode } from 'react';
import type { SeriesScope } from '../../shared/types';
import { cn } from '../lib/utils';

const SCOPE_LABELS: Record<SeriesScope, string> = {
  one: 'This one',
  this_and_later: 'This and later',
  all: 'All of them',
};

interface Props {
  value: SeriesScope;
  onChange: (scope: SeriesScope) => void;
  /** What this choice governs, e.g. "What moves" or "Apply the name to". */
  label: string;
  /** A line under the buttons saying what the current choice will do. */
  hint?: ReactNode;
}

/**
 * How far an edit to one occurrence reaches. Shared by Move dates and by both
 * edit dialogs so the three never drift — this is the single idea the whole
 * series feature rests on, and it should look and read the same everywhere.
 *
 * Callers are expected to default it to 'one' and reset it every time their
 * surface opens. A remembered wider scope turns the next small edit into a
 * silent rewrite of a semester.
 */
export default function SeriesScopeField({ value, onChange, label, hint }: Props) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      <div className="flex gap-1.5">
        {(Object.keys(SCOPE_LABELS) as SeriesScope[]).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={cn(
              'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              value === option
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line text-ink-soft hover:bg-surface-hi',
            )}
          >
            {SCOPE_LABELS[option]}
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}
