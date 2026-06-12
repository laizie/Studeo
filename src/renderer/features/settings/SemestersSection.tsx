import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { Term } from '../../../shared/types';
import { useTerms, useCreateTerm, useDeleteTerm } from '../../lib/queries/useTerms';
import { parseDateLocal } from '../../../shared/deadlines';
import ConfirmDialog from '../../components/ConfirmDialog';
import { SectionHeading, SettingsCard, SETTINGS_INPUT } from './components';
import { cn } from '../../lib/utils';

// Semester ranges span months and often years — show "Aug 18, 2026", never raw ISO.
function formatTermDate(dateStr: string): string {
  return parseDateLocal(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function SemestersSection() {
  const { data: terms = [] } = useTerms();
  const createTerm = useCreateTerm();
  const deleteTerm = useDeleteTerm();

  const [newTermName,  setNewTermName]  = useState('');
  const [newTermStart, setNewTermStart] = useState('');
  const [newTermEnd,   setNewTermEnd]   = useState('');
  const [deletingTerm, setDeletingTerm] = useState<Term | null>(null);

  // ISO date strings compare correctly as plain strings.
  const termDatesInvalid = !!newTermStart && !!newTermEnd && newTermEnd < newTermStart;

  async function handleAddTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!newTermName.trim() || termDatesInvalid) return;
    try {
      await createTerm.mutateAsync({
        name:      newTermName.trim(),
        startDate: newTermStart || undefined,
        endDate:   newTermEnd   || undefined,
      });
    } catch {
      return; // keep the user's input; createTerm.isError renders the message
    }
    setNewTermName('');
    setNewTermStart('');
    setNewTermEnd('');
  }

  return (
    <div className="mb-8">
      <SectionHeading>Semesters</SectionHeading>
      <p className="text-xs text-muted mb-3 -mt-1">
        Group courses by term — Dashboard and Courses auto-select the current one by date.
      </p>
      <SettingsCard>
        {terms.length === 0 && (
          <div className="px-5 py-4 text-sm text-muted">
            No semesters yet. Add one below.
          </div>
        )}
        {terms.map(t => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium text-ink-soft">{t.name}</p>
              {(t.start_date || t.end_date) && (
                <p className="text-xs text-muted mt-0.5">
                  {t.start_date && t.end_date
                    ? `${formatTermDate(t.start_date)} – ${formatTermDate(t.end_date)}`
                    : t.start_date
                      ? `From ${formatTermDate(t.start_date)}`
                      : `Until ${formatTermDate(t.end_date!)}`}
                </p>
              )}
            </div>
            <button
              onClick={() => setDeletingTerm(t)}
              aria-label={`Delete semester ${t.name}`}
              className="ml-4 p-1.5 text-muted hover:text-red-500 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              title="Delete semester"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {/* Add term form */}
        <form onSubmit={handleAddTerm} className="px-5 py-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            Add semester
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newTermName}
              onChange={e => setNewTermName(e.target.value)}
              placeholder="e.g. Fall 2026"
              aria-label="Semester name"
              className={cn(SETTINGS_INPUT, 'w-full')}
            />
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="block text-xs text-muted mb-1">Starts (optional)</span>
                <input
                  type="date"
                  value={newTermStart}
                  onChange={e => setNewTermStart(e.target.value)}
                  className={cn(SETTINGS_INPUT, 'w-full')}
                />
              </label>
              <label className="flex-1">
                <span className="block text-xs text-muted mb-1">Ends (optional)</span>
                <input
                  type="date"
                  value={newTermEnd}
                  onChange={e => setNewTermEnd(e.target.value)}
                  className={cn(SETTINGS_INPUT, 'w-full')}
                />
              </label>
            </div>
            {termDatesInvalid && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                The end date is before the start date.
              </p>
            )}
            {createTerm.isError && (
              <p className="text-xs text-red-500 dark:text-red-400">
                Something went wrong — your semester wasn't saved. Please try again.
              </p>
            )}
            <button
              type="submit"
              disabled={!newTermName.trim() || termDatesInvalid || createTerm.isPending}
              className="flex items-center justify-center gap-1.5 px-4 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={13} />
              {createTerm.isPending ? 'Adding…' : 'Add semester'}
            </button>
          </div>
        </form>
      </SettingsCard>

      <ConfirmDialog
        isOpen={deletingTerm !== null}
        title={`Delete "${deletingTerm?.name}"?`}
        message="Courses assigned to it are kept — they just lose their semester grouping."
        onConfirm={() => { if (deletingTerm) deleteTerm.mutate(deletingTerm.id); }}
        onClose={() => setDeletingTerm(null)}
      />
    </div>
  );
}
