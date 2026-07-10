import { useEffect } from 'react';
import { useTerms } from './queries/useTerms';
import { usePageFiltersStore } from '../store/usePageFiltersStore';
import { localDayKey } from '../../shared/studyStats';

/**
 * The semester dropdown's shared brain (Dashboard + Courses use it): reads the
 * persisted filter and, once terms load, auto-selects the term whose date range
 * contains today. One-time only (guarded by termFilterInitialized) — re-running
 * on every null would snap the dropdown back when the user explicitly picks
 * "All semesters".
 */
export function useTermFilter() {
  const { data: terms = [] } = useTerms();
  const termFilter            = usePageFiltersStore(s => s.termFilter);
  const setTermFilter         = usePageFiltersStore(s => s.setTermFilter);
  const termFilterInitialized = usePageFiltersStore(s => s.termFilterInitialized);
  const initTermFilter        = usePageFiltersStore(s => s.initTermFilter);

  useEffect(() => {
    if (termFilterInitialized || terms.length === 0) return;
    const today = localDayKey(new Date()); // local date — toISOString() is UTC and drifts a day in the evening
    const current = terms.find(t =>
      t.start_date && t.end_date && t.start_date <= today && today <= t.end_date
    );
    initTermFilter(current?.id ?? null);
  }, [terms, termFilterInitialized, initTermFilter]);

  return { terms, termFilter, setTermFilter };
}
