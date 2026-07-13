import { useState } from 'react';
import { WIZARD_INPUT } from './constants';

interface Props {
  initialName: string;
  initialStart: string;
  initialEnd: string;
  saving: boolean;
  error: boolean;
  onContinue: (values: { name: string; startDate: string; endDate: string }) => void;
}

/** Step 1 — name the semester and (optionally) bound its dates. */
export default function TermStep({ initialName, initialStart, initialEnd, saving, error, onContinue }: Props) {
  const [name, setName]   = useState(initialName);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd]     = useState(initialEnd);

  // ISO date strings compare correctly as plain strings.
  const datesInvalid = !!start && !!end && end < start;
  const canContinue = !!name.trim() && !datesInvalid && !saving;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    onContinue({ name: name.trim(), startDate: start, endDate: end });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Name your semester</h2>
        <p className="mt-1 text-sm text-muted">
          Courses you add next get grouped under it. Dates are optional but let the
          Dashboard auto-select the current term.
        </p>
      </div>

      <div>
        <label htmlFor="term-name" className="mb-1 block text-sm font-medium text-ink-soft">Semester name</label>
        <input
          id="term-name"
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Fall 2026"
          className={WIZARD_INPUT}
          required
        />
      </div>

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-ink-soft">
            Starts <span className="font-normal text-muted">(optional)</span>
          </span>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className={WIZARD_INPUT} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-ink-soft">
            Ends <span className="font-normal text-muted">(optional)</span>
          </span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={WIZARD_INPUT} />
        </label>
      </div>

      {datesInvalid && (
        <p className="text-sm text-amber-600 dark:text-amber-400">The end date is before the start date.</p>
      )}
      {error && (
        <p className="text-sm text-red-600">Couldn't save the semester — please try again.</p>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={!canContinue}
          className="rounded-lg bg-accent px-5 py-2 text-sm text-accent-ink transition-colors hover:bg-accent-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
