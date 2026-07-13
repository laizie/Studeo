import { useState, useRef, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronDown, FileText, Repeat, FileUp, Loader2 } from 'lucide-react';
import { useCourse } from '../../lib/queries/useCourses';
import { useCreateAssignments } from '../../lib/queries/useAssignments';
import { ASSIGNMENT_TYPES, type AssignmentType } from '../../../shared/types';
import { parseSyllabus } from '../../../shared/syllabusParser';
import { generateRepeats } from '../../../shared/repeat';
import { cn } from '../../lib/utils';
import { errorReason } from '../../lib/errors';

// ── Row type ──────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  name: string;
  type: AssignmentType;
  dueDate: string;
}

function makeRow(name = '', type: AssignmentType = 'Assignment', dueDate = ''): Row {
  return { id: crypto.randomUUID(), name, type, dueDate };
}

// ── Shared input style ────────────────────────────────────────────────────────

const INPUT =
  'w-full px-2.5 py-1.5 text-sm border border-line rounded-lg ' +
  'bg-surface dark:bg-inset text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted focus:border-transparent ' +
  'placeholder:text-muted';

// ── Component ─────────────────────────────────────────────────────────────────

export default function BatchAddPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: course } = useCourse(courseId ?? '');
  const createAssignments = useCreateAssignments();

  const [rows, setRows]           = useState<Row[]>([makeRow()]);
  const [importOpen, setImportOpen] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [importError, setImportError]   = useState('');
  const [importYear, setImportYear]     = useState(() => new Date().getFullYear());
  const [pdfFileName, setPdfFileName]   = useState('');  // name of the last loaded PDF
  const [extracting, setExtracting]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');

  // Repeat panel: which row it's open for, and its settings.
  const [repeatFor, setRepeatFor]     = useState<string | null>(null);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  // Map of row id → name input element, used for keyboard focus management.
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // When non-null, focus this row's name input on the next render.
  const pendingFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (pendingFocusId.current) {
      nameRefs.current[pendingFocusId.current]?.focus();
      pendingFocusId.current = null;
    }
  }, [rows]);

  // ── Row mutations ─────────────────────────────────────────────────────────

  function updateRow(id: string, field: keyof Omit<Row, 'id'>, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function addRowAfter(id?: string) {
    const row = makeRow();
    pendingFocusId.current = row.id;
    setRows(prev => {
      if (!id) return [...prev, row];
      const idx = prev.findIndex(r => r.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, row);
      return next;
    });
  }

  function removeRow(id: string) {
    if (repeatFor === id) setRepeatFor(null);
    setRows(prev => {
      if (prev.length === 1) {
        // Reset to one blank row rather than leaving an empty grid.
        const blank = makeRow();
        pendingFocusId.current = blank.id;
        return [blank];
      }
      return prev.filter(r => r.id !== id);
    });
  }

  // ── Repeat ────────────────────────────────────────────────────────────────

  function toggleRepeat(id: string) {
    setRepeatFor(prev => (prev === id ? null : id));
  }

  function handleGenerateRepeats(row: Row) {
    const extra = generateRepeats(row.name, row.dueDate, repeatUntil, repeatWeeks);
    if (extra.length === 0) return;
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === row.id);
      const next = [...prev];
      next.splice(idx + 1, 0, ...extra.map(o => makeRow(o.name, row.type, o.dueDate)));
      return next;
    });
    setRepeatFor(null);
    setRepeatUntil('');
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────

  // Enter walks down the grid (and grows it at the bottom); ⌘↵ saves the whole
  // thing from wherever the cursor is — after 40 rows, reaching for the mouse to
  // click Save is the one thing left that breaks the typing rhythm.
  function handleRowKey(e: React.KeyboardEvent, rowId: string) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      handleSave();
      return;
    }
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx === rows.length - 1) {
      addRowAfter(rowId);
    } else {
      nameRefs.current[rows[idx + 1].id]?.focus();
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  // Pull text out of a syllabus PDF (file dialog + extraction happen in main).
  // We only fill the textarea — the user reviews/edits, then hits "Parse & add".
  async function handlePickPdf() {
    setExtracting(true);
    setImportError('');
    try {
      const res = await window.api.syllabus.extractPdf();
      if (res.canceled) return;
      setSyllabusText(res.text);
      setPdfFileName(res.fileName);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't read that PDF.");
    } finally {
      setExtracting(false);
    }
  }

  function handleImport() {
    const parsed = parseSyllabus(syllabusText, importYear);
    if (parsed.length === 0) {
      setImportError('No assignments found in that text — try pasting lines like "Homework 1 - January 20".');
      return;
    }

    const newRows = parsed.map(p => makeRow(p.name, p.type, p.dueDate));
    setRows(prev => {
      const isBlank = prev.length === 1 && !prev[0].name && !prev[0].dueDate;
      return isBlank ? newRows : [...prev, ...newRows];
    });
    setImportOpen(false);
    setSyllabusText('');
    setImportError('');
    setPdfFileName('');
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const validRows   = rows.filter(r => r.name.trim() && r.dueDate);
  const skippedCount = rows.filter(r => r.name.trim() && !r.dueDate).length;

  async function handleSave() {
    if (!courseId || validRows.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      // One atomic IPC call: either the whole batch saves or none of it does,
      // so a mid-save failure can't leave half a semester in the database.
      await createAssignments.mutateAsync(
        validRows.map(row => ({
          courseId,
          name: row.name.trim(),
          type: row.type,
          dueDate: row.dueDate,
        }))
      );
      navigate(`/courses/${courseId}`);
    } catch (err) {
      const reason = errorReason(err) ?? 'Something went wrong';
      setSaveError(`${reason} — nothing was saved. Please try again.`);
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl">
      {/* Back link */}
      <Link
        to={courseId ? `/courses/${courseId}` : '/courses'}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink-soft transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        {course?.name ?? 'Course'}
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">
          Batch add assignments
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {course ? `Adding to ${course.name}` : 'Loading…'}
        </p>
      </div>

      {/* ── Import from syllabus (collapsible) ─────────────────────────── */}
      <div className="mb-6 border border-line rounded-xl overflow-hidden">
        <button
          onClick={() => setImportOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-inset hover:bg-surface-hi transition-colors text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={15} className="text-muted shrink-0" />
            <span className="text-sm font-medium text-ink-soft shrink-0">
              Import from syllabus
            </span>
            <span className="text-xs text-muted truncate hidden sm:block">
              Paste your syllabus text and we'll extract the assignments
            </span>
          </div>
          <ChevronDown
            size={15}
            className={cn(
              'text-muted transition-transform shrink-0 ml-3',
              importOpen && 'rotate-180',
            )}
          />
        </button>

        {importOpen && (
          <div className="p-5 border-t border-line bg-surface dark:bg-inset space-y-4">
            <p className="text-xs text-muted">
              Each line is treated as one assignment. Dates like "Jan 15", "2/14", or "March 1st"
              are extracted automatically. Lines with no date will appear in the grid with an empty
              due date for you to fill in.
            </p>

            {/* Upload a PDF instead of pasting — extracts its text into the box below. */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handlePickPdf}
                disabled={extracting}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-line text-ink-soft rounded-lg hover:bg-surface-hi disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {extracting ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                {extracting ? 'Reading PDF…' : 'Choose PDF file'}
              </button>
              <span className="text-xs text-muted">
                {pdfFileName
                  ? <>Loaded <span className="text-ink-soft font-medium">{pdfFileName}</span> — review the text below.</>
                  : 'Or upload your syllabus PDF and we\'ll pull the text out.'}
              </span>
            </div>

            <textarea
              value={syllabusText}
              onChange={e => { setSyllabusText(e.target.value); setImportError(''); }}
              placeholder={
                'Homework 1 - January 20\nQuiz 1 (Feb 3)\nMidterm Exam — March 1st\nFinal Project due April 15'
              }
              rows={8}
              className={cn(INPUT, 'resize-y font-mono text-xs leading-relaxed')}
            />

            {importError && (
              <p className="text-sm text-amber-700 dark:text-amber-400">{importError}</p>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label htmlFor="import-year" className="text-xs text-muted shrink-0">Year</label>
                <input
                  id="import-year"
                  type="number"
                  value={importYear}
                  onChange={e => setImportYear(Number(e.target.value))}
                  className={cn(INPUT, 'w-24')}
                  min={2020}
                  max={2099}
                />
              </div>

              <button
                onClick={handleImport}
                disabled={!syllabusText.trim()}
                className="px-4 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Parse &amp; add to grid
              </button>

              <button
                onClick={() => { setImportOpen(false); setSyllabusText(''); setPdfFileName(''); }}
                className="text-sm text-muted hover:text-ink-soft transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div className="border border-line rounded-xl overflow-hidden mb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_150px_160px_64px] gap-x-2 bg-inset border-b border-line px-4 py-2.5">
          <span className="text-xs font-medium text-muted">Assignment name</span>
          <span className="text-xs font-medium text-muted">Type</span>
          <span className="text-xs font-medium text-muted">Due date</span>
          <span />
        </div>

        {/* Data rows */}
        <div className="divide-y divide-line">
          {rows.map((row, idx) => {
            const repeatOpen = repeatFor === row.id;
            const repeatPreview = repeatOpen
              ? generateRepeats(row.name, row.dueDate, repeatUntil, repeatWeeks)
              : [];
            return (
              <div key={row.id}>
                <div className="grid grid-cols-[1fr_150px_160px_64px] gap-x-2 items-center px-4 py-2 bg-surface dark:bg-inset hover:bg-surface-hi/60 transition-colors">
                  <input
                    ref={el => { nameRefs.current[row.id] = el; }}
                    type="text"
                    value={row.name}
                    onChange={e => updateRow(row.id, 'name', e.target.value)}
                    onKeyDown={e => handleRowKey(e, row.id)}
                    placeholder={`Assignment ${idx + 1}`}
                    // The column headers are visual only — a screen reader hears
                    // an unlabeled field without these. Row number included so
                    // "name, row 3" is unambiguous in a 40-row grid.
                    aria-label={`Assignment name, row ${idx + 1}`}
                    className={INPUT}
                  />
                  <select
                    value={row.type}
                    onChange={e => updateRow(row.id, 'type', e.target.value as AssignmentType)}
                    aria-label={`Type, row ${idx + 1}`}
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
                    onKeyDown={e => handleRowKey(e, row.id)}
                    aria-label={`Due date, row ${idx + 1}`}
                    className={cn(INPUT, !row.dueDate && row.name && 'border-amber-300 dark:border-amber-700')}
                  />
                  {/* Reachable by keyboard: this is the flagship keyboard surface,
                      so its two row controls can't be mouse-only. They sit after
                      the row's fields in tab order, which is where they belong. */}
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleRepeat(row.id)}
                      className={cn(
                        'p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400',
                        repeatOpen ? 'text-accent' : 'text-muted hover:text-accent'
                      )}
                      title="Repeat this assignment weekly"
                      aria-label={`Repeat row ${idx + 1} weekly`}
                      aria-expanded={repeatOpen}
                    >
                      <Repeat size={13} />
                    </button>
                    <button
                      onClick={() => removeRow(row.id)}
                      className="p-1 text-muted hover:text-red-400 dark:hover:text-red-400 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      title="Remove row"
                      aria-label={`Remove row ${idx + 1}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Repeat panel — expands the row into a series */}
                {repeatOpen && (
                  <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-inset border-t border-line">
                    <span className="text-xs text-muted">Repeat</span>
                    <select
                      value={repeatWeeks}
                      onChange={e => setRepeatWeeks(Number(e.target.value))}
                      className={cn(INPUT, 'w-auto')}
                    >
                      <option value={1}>every week</option>
                      <option value={2}>every 2 weeks</option>
                    </select>
                    <span className="text-xs text-muted">until</span>
                    <input
                      type="date"
                      value={repeatUntil}
                      onChange={e => setRepeatUntil(e.target.value)}
                      className={cn(INPUT, 'w-auto')}
                    />
                    <button
                      onClick={() => handleGenerateRepeats(row)}
                      disabled={repeatPreview.length === 0}
                      className="px-3 py-1.5 text-xs bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {repeatPreview.length > 0
                        ? `Add ${repeatPreview.length} more`
                        : 'Add repeats'}
                    </button>
                    {(!row.name.trim() || !row.dueDate) && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Fill in this row's name and due date first.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <button
          onClick={() => addRowAfter()}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted hover:text-ink-soft hover:bg-surface-hi transition-colors border-t border-line"
        >
          <Plus size={14} />
          Add row
        </button>
      </div>

      {/* Warnings */}
      {skippedCount > 0 && (
        <p className="text-xs text-amber-500 dark:text-amber-400 mb-3">
          {skippedCount} row{skippedCount !== 1 ? 's' : ''} with no due date will be skipped on save.
        </p>
      )}
      {saveError && (
        <p className="text-sm text-red-500 dark:text-red-400 mb-3">{saveError}</p>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={validRows.length === 0 || saving}
          className="px-5 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? 'Saving…'
            : `Save ${validRows.length} assignment${validRows.length !== 1 ? 's' : ''}`}
        </button>
        <Link
          to={courseId ? `/courses/${courseId}` : '/courses'}
          className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
        >
          Cancel
        </Link>
        <span className="text-xs text-muted ml-2">
          Enter to jump rows · Tab to move between fields · ⌘↵ to save
        </span>
      </div>
    </div>
  );
}
