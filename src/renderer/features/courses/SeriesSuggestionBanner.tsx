import { useMemo, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import type { Assignment } from '../../../shared/types';
import { detectSeriesCandidates } from '../../../shared/repeat';
import type { LinkCandidate } from '../../../shared/repeat';
import { formatDueDate } from '../../../shared/deadlines';
import { useLinkIntoSeries, useDeleteAssignmentSeries } from '../../lib/queries/useAssignmentSeries';
import { showUndoToast } from '../../store/useToastStore';
import { cn } from '../../lib/utils';

interface Props {
  courseId: string;
  assignments: Assignment[];
}

/**
 * Dismissals live in localStorage, per course, keyed by a description of the
 * group rather than by row ids.
 *
 * Saying "not a series" is a judgement about these assignments, and it should
 * stick — but only for them. Keying on the shape means adding a sixth Homework
 * later produces a different group, which gets asked about again, while the
 * five already refused stay quiet.
 */
const dismissKey = (courseId: string) => `studeo:seriesSuggestions:${courseId}`;

function signature(candidate: LinkCandidate): string {
  return [
    candidate.stem,
    candidate.intervalWeeks,
    candidate.members.length,
    candidate.members[0].dueDate,
  ].join('|');
}

function readDismissed(courseId: string): string[] {
  try {
    const raw = localStorage.getItem(dismissKey(courseId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function addDismissed(courseId: string, sig: string): void {
  try {
    const next = [...new Set([...readDismissed(courseId), sig])];
    localStorage.setItem(dismissKey(courseId), JSON.stringify(next));
  } catch {
    // A full or blocked localStorage shouldn't break the page. The suggestion
    // comes back next visit, which is annoying but harmless.
  }
}

/**
 * Offers to link assignments that look like a series but aren't one.
 *
 * Everything added before series existed is unlinked, and so is anything the
 * ICS importer creates — which is most of a semester, for anyone who has been
 * using the app a while. They can't be migrated automatically: guessing which
 * of someone's real graded assignments belong together, and acting on the
 * guess, is not a thing to do quietly. So the evidence is shown and the user
 * decides.
 *
 * One candidate at a time, deliberately. A course with three stale series would
 * otherwise open as a wall of prompts; linking the first simply reveals the next.
 */
export default function SeriesSuggestionBanner({ courseId, assignments }: Props) {
  const link = useLinkIntoSeries();
  const deleteSeries = useDeleteAssignmentSeries();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(courseId));

  const candidate = useMemo(() => {
    const unlinked = assignments
      .filter(a => a.series_id === null)
      .map(a => ({ id: a.id, name: a.name, dueDate: a.due_date }));
    return detectSeriesCandidates(unlinked).find(c => !dismissed.includes(signature(c))) ?? null;
  }, [assignments, dismissed]);

  if (!candidate) return null;

  const { stem, intervalWeeks, members } = candidate;
  const cadence = intervalWeeks === 1 ? 'weekly' : `every ${intervalWeeks} weeks`;

  function handleDismiss() {
    if (!candidate) return;
    const sig = signature(candidate);
    addDismissed(courseId, sig);
    setDismissed(prev => [...prev, sig]);
  }

  function handleLink() {
    if (!candidate) return;
    link.mutate(
      {
        courseId,
        intervalWeeks: candidate.intervalWeeks,
        assignmentIds: candidate.members.map(m => m.id),
      },
      {
        // Undo is exactly "stop repeating": the rule goes, every row stays put
        // with its name, date and grade untouched. Linking really is reversible,
        // which is what makes it safe to offer.
        onSuccess: ({ series }) =>
          showUndoToast(`Linked ${candidate.members.length} assignments`, () =>
            deleteSeries.mutate(series.id),
          ),
      },
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Repeat size={15} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">
            These {members.length} look like a {cadence} series.
          </p>
          <p className="mt-1 text-xs text-muted">
            {members[0].name} · {formatDueDate(members[0].dueDate)} → {members[members.length - 1].name} ·{' '}
            {formatDueDate(members[members.length - 1].dueDate)}
          </p>
          <p className="mt-2 text-xs text-muted">
            Linking lets you move or rename them together. Nothing else changes — the names,
            dates and grades stay exactly as they are.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleLink}
              disabled={link.isPending}
              className={cn(
                'rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-ink transition-colors',
                'hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              )}
            >
              {link.isPending ? 'Linking…' : `Link “${stem}” as a series`}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Not a series
            </button>
          </div>

          {link.isError && (
            <p className="mt-2 text-xs text-red-600">
              Couldn’t link those — they may have changed since. Reload and try again.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss this suggestion"
          className="shrink-0 rounded p-1 text-muted transition-colors hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
