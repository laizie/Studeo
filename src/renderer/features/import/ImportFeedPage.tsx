import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Rss, Loader2, Download, ChevronRight, Check } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments, useCreateAssignments } from '../../lib/queries/useAssignments';
import { parseIcs, type ParsedIcsEvent } from '../../../shared/icsParser';
import { ASSIGNMENT_TYPES, type AssignmentType, type Course } from '../../../shared/types';
import { cn } from '../../lib/utils';
import { readPref, writePref } from '../../lib/prefs';

// We persist the last-used feed URL under this settings key (owned by main) so a
// re-import is one click. It's a one-off preference, so we read/write it directly
// rather than threading it through the global settings store.
const FEED_URL_KEY = 'canvasFeedUrl' as const;

// Grouping key used for events that carry no "[Course]" label in their summary.
const NO_COURSE = '__none__';

const INPUT =
  'w-full px-2.5 py-1.5 text-sm border border-line rounded-lg ' +
  'bg-surface dark:bg-inset text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent ' +
  'placeholder:text-muted';

// ── Pure helpers ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best guess at which Studeo course a detected feed label belongs to, by loose
 * name/abbreviation overlap. Returns '' ("skip") when nothing is close — the
 * user always gets the final say via the dropdown.
 */
function guessCourseId(label: string, courses: Course[]): string {
  const n = normalize(label);
  if (!n) return '';
  // Exact name/abbreviation match wins.
  for (const c of courses) {
    if (normalize(c.name) === n || normalize(c.abbreviation) === n) return c.id;
  }
  // Otherwise, accept a containment overlap either direction.
  for (const c of courses) {
    const name = normalize(c.name);
    const abbr = normalize(c.abbreviation);
    if (name && (name.includes(n) || n.includes(name))) return c.id;
    if (abbr && (abbr.includes(n) || n.includes(abbr))) return c.id;
  }
  return '';
}

// Identity used for de-dup: same course + same name + same due date = "already have it".
function existingKey(courseId: string, name: string, dueDate: string): string {
  // \u0000 rather than a raw NUL byte. The separator has to be something that can't
  // appear in a course name or an assignment title, and NUL is the right choice — but
  // embedding the byte literally made this file `data` to file(1), so grep, git grep
  // and ripgrep all skipped it as binary.
  return `${courseId}\u0000${name.toLowerCase().trim()}\u0000${dueDate}`;
}

// ── Preview row ─────────────────────────────────────────────────────────────

interface PreviewRow {
  id: string;
  courseId: string;
  name: string;
  type: AssignmentType;
  dueDate: string;
  /** Time of day parsed from the feed ("HH:MM"), or null for an all-day event. */
  dueTime: string | null;
  selected: boolean;
}

interface Group {
  key: string;   // courseLabel, or NO_COURSE
  label: string; // human label for the dropdown row
  count: number;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ImportFeedPage() {
  const navigate = useNavigate();
  const { data: courses = [] } = useCourses();
  const { data: assignments = [] } = useAssignments();
  const createAssignments = useCreateAssignments();

  const [step, setStep] = useState<'url' | 'map' | 'preview'>('url');

  // Step 1 — URL
  const [url, setUrl] = useState(() => readPref(FEED_URL_KEY) ?? '');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Step 2 — parsed events + mapping
  const [events, setEvents] = useState<ParsedIcsEvent[]>([]);
  const [includeEvents, setIncludeEvents] = useState(false); // include non-assignment calendar items
  const [mapping, setMapping] = useState<Record<string, string>>({}); // group key → courseId | ''

  // Step 3 — preview rows
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Only assignment events by default; the toggle pulls in generic calendar events too.
  const consideredEvents = useMemo(
    () => events.filter(e => includeEvents || e.isAssignment),
    [events, includeEvents],
  );

  // Distinct course labels detected in the feed, with their item counts.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const e of consideredEvents) {
      const key = e.courseLabel ?? NO_COURSE;
      const label = e.courseLabel ?? 'No course label';
      const g = map.get(key);
      if (g) g.count += 1;
      else map.set(key, { key, label, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [consideredEvents]);

  // Seed each detected group with a best-guess mapping, keeping any choice the
  // user already made. Re-runs if the groups or the course list change.
  useEffect(() => {
    setMapping(prev => {
      const next: Record<string, string> = {};
      for (const g of groups) {
        next[g.key] = prev[g.key] ?? (g.key === NO_COURSE ? '' : guessCourseId(g.label, courses));
      }
      return next;
    });
  }, [groups, courses]);

  // Fast lookup of what's already in the database, for the smart-preview dedup.
  const existingSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of assignments) s.add(existingKey(a.course_id, a.name, a.due_date));
    return s;
  }, [assignments]);

  const mappedCount = useMemo(
    () => consideredEvents.filter(e => mapping[e.courseLabel ?? NO_COURSE]).length,
    [consideredEvents, mapping],
  );

  const courseName = (id: string) => courses.find(c => c.id === id)?.name ?? 'Course';

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleFetch() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setFetching(true);
    setFetchError('');
    try {
      const { text } = await window.api.feeds.fetchIcs(trimmed);
      const parsed = parseIcs(text);
      if (parsed.length === 0) {
        setFetchError('We fetched the feed, but it had no events to import.');
        return;
      }
      writePref(FEED_URL_KEY, trimmed); // remember for next time
      setEvents(parsed);
      setStep('map');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Something went wrong fetching the feed.');
    } finally {
      setFetching(false);
    }
  }

  function handleContinueToPreview() {
    const built: PreviewRow[] = [];
    for (const e of consideredEvents) {
      const courseId = mapping[e.courseLabel ?? NO_COURSE];
      if (!courseId) continue; // group was left as "Skip"
      const exists = existingSet.has(existingKey(courseId, e.title, e.dueDate));
      built.push({
        id: crypto.randomUUID(),
        courseId,
        name: e.title,
        type: e.type,
        dueDate: e.dueDate,
        dueTime: e.dueTime, // carried through from the feed (was previously dropped)
        // Pre-check only items that are new and dated — that's the dedup.
        selected: !exists && !!e.dueDate,
      });
    }
    setRows(built);
    setStep('preview');
  }

  function updateRow(id: string, field: 'name' | 'type' | 'dueDate', value: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function toggleRow(id: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }

  const importable = rows.filter(r => r.selected && r.name.trim() && r.dueDate);

  async function handleImport() {
    if (importable.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      // One atomic batch — either every assignment saves or none do.
      await createAssignments.mutateAsync(
        importable.map(r => ({
          courseId: r.courseId,
          name: r.name.trim(),
          type: r.type,
          dueDate: r.dueDate,
          dueTime: r.dueTime,
        })),
      );
      navigate('/courses');
    } catch {
      setSaveError('Something went wrong — nothing was saved. Please try again.');
      setSaving(false);
    }
  }

  // Group preview rows by their target course for a tidy, course-by-course view.
  const rowsByCourse = useMemo(() => {
    const map = new Map<string, PreviewRow[]>();
    for (const r of rows) {
      const arr = map.get(r.courseId) ?? [];
      arr.push(r);
      map.set(r.courseId, arr);
    }
    return [...map.entries()];
  }, [rows]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink-soft transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Courses
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Import from Canvas / LMS</h1>
        <p className="mt-0.5 text-sm text-muted">
          Pull your assignments straight from your school's calendar feed.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted mb-6">
        <StepDot active={step === 'url'} done={step !== 'url'} label="Feed URL" />
        <ChevronRight size={13} className="text-line" />
        <StepDot active={step === 'map'} done={step === 'preview'} label="Match courses" />
        <ChevronRight size={13} className="text-line" />
        <StepDot active={step === 'preview'} done={false} label="Review & import" />
      </div>

      {/* ── Step 1: URL ─────────────────────────────────────────────────── */}
      {step === 'url' && (
        <div className="border border-line rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Rss size={18} className="text-accent-text shrink-0 mt-0.5" />
            <div className="text-sm text-ink-soft space-y-1">
              <p className="font-medium text-ink">Paste your calendar feed URL</p>
              <p className="text-muted text-xs leading-relaxed">
                In Canvas, open <span className="text-ink-soft">Calendar</span>, click{' '}
                <span className="text-ink-soft">Calendar Feed</span> (bottom-right), and copy the
                link. Most other LMSs have a similar "export / subscribe to calendar" link ending in
                <span className="font-mono"> .ics</span>.
              </p>
            </div>
          </div>

          <input
            type="url"
            value={url}
            onChange={e => { setUrl(e.target.value); setFetchError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
            placeholder="https://canvas.yourschool.edu/feeds/calendars/user_xxxxx.ics"
            className={cn(INPUT, 'font-mono text-xs')}
          />

          {fetchError && <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleFetch}
              disabled={!url.trim() || fetching}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {fetching ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {fetching ? 'Fetching…' : 'Fetch feed'}
            </button>
            <span className="text-xs text-muted">
              Your URL is fetched locally and remembered for next time.
            </span>
          </div>
        </div>
      )}

      {/* ── Step 2: Map courses ─────────────────────────────────────────── */}
      {step === 'map' && (
        <div className="space-y-5">
          {courses.length === 0 ? (
            <div className="border border-line rounded-xl p-6 text-sm text-muted">
              You don't have any courses yet. {' '}
              <Link to="/courses" className="text-accent-text hover:underline">Create a course</Link>{' '}
              first, then come back to import into it.
            </div>
          ) : (
            <>
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-inset border-b border-line">
                  <p className="text-sm font-medium text-ink-soft">
                    We found {groups.length} course{groups.length !== 1 ? 's' : ''} in your feed
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Match each one to a course in Studeo, or skip it.
                  </p>
                </div>

                <div className="divide-y divide-line">
                  {groups.map(g => (
                    <div key={g.key} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink truncate">{g.label}</p>
                        <p className="text-xs text-muted">{g.count} item{g.count !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronRight size={14} className="text-line shrink-0" />
                      <select
                        value={mapping[g.key] ?? ''}
                        onChange={e => setMapping(prev => ({ ...prev, [g.key]: e.target.value }))}
                        className={cn(INPUT, 'w-52 shrink-0')}
                      >
                        <option value="">— Skip —</option>
                        {courses.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEvents}
                  onChange={e => setIncludeEvents(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                Also include non-assignment calendar events (office hours, lectures, etc.)
              </label>
            </>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleContinueToPreview}
              disabled={mappedCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Preview {mappedCount} item{mappedCount !== 1 ? 's' : ''}
              <ChevronRight size={15} />
            </button>
            <button
              onClick={() => setStep('url')}
              className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview & import ────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Ticked rows will be imported. Items you already have are unticked — tick them to import
            anyway. You can edit any name, type, or date before importing.
          </p>

          {rowsByCourse.map(([courseId, courseRows]) => (
            <div key={courseId} className="border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-inset border-b border-line flex items-center justify-between">
                <span className="text-sm font-medium text-ink-soft">{courseName(courseId)}</span>
                <span className="text-xs text-muted">
                  {courseRows.filter(r => r.selected).length} of {courseRows.length} selected
                </span>
              </div>

              <div className="divide-y divide-line">
                {courseRows.map(row => {
                  const exists = existingSet.has(existingKey(row.courseId, row.name, row.dueDate));
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[24px_1fr_140px_150px] gap-x-2 items-center px-4 py-2 bg-surface dark:bg-inset"
                    >
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggleRow(row.id)}
                        className="accent-[var(--color-accent)] justify-self-center"
                      />
                      <div className="min-w-0">
                        <input
                          type="text"
                          value={row.name}
                          onChange={e => updateRow(row.id, 'name', e.target.value)}
                          className={INPUT}
                        />
                        {exists && (
                          <span className="mt-0.5 inline-block text-caption text-muted">
                            Already in {courseName(row.courseId)}
                          </span>
                        )}
                      </div>
                      <select
                        value={row.type}
                        onChange={e => updateRow(row.id, 'type', e.target.value as AssignmentType)}
                        className={INPUT}
                      >
                        {ASSIGNMENT_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={e => updateRow(row.id, 'dueDate', e.target.value)}
                        className={cn(INPUT, !row.dueDate && 'border-amber-300 dark:border-amber-700')}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importable.length === 0 || saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving
                ? 'Importing…'
                : `Import ${importable.length} assignment${importable.length !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => setStep('map')}
              className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Small step-indicator pill.
function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
        active ? 'bg-accent/10 text-accent-text font-medium' : done ? 'text-ink-soft' : 'text-muted',
      )}
    >
      {done ? <Check size={12} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
