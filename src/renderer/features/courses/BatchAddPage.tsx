import { useState, useRef, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronDown, FileText } from 'lucide-react';
import { useCourse } from '../../lib/queries/useCourses';
import { useCreateAssignments } from '../../lib/queries/useAssignments';
import { ASSIGNMENT_TYPES, type AssignmentType } from '../../../shared/types';
import { parseSyllabus } from '../../../shared/syllabusParser';
import { cn } from '../../lib/utils';

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
  'bg-white dark:bg-inset text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted focus:border-transparent ' +
  'placeholder:text-stone-500 dark:placeholder:text-muted';

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
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');

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

  // ── Keyboard navigation ───────────────────────────────────────────────────

  function handleNameKey(e: React.KeyboardEvent, rowId: string) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx === rows.length - 1) {
      addRowAfter(rowId);
    } else {
      nameRefs.current[rows[idx + 1].id]?.focus();
    }
  }

  function handleDateKey(e: React.KeyboardEvent, rowId: string) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx === rows.length - 1) {
      addRowAfter(rowId);
    } else {
      nameRefs.current[rows[idx + 1].id]?.focus();
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

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
    } catch {
      setSaveError('Something went wrong — nothing was saved. Please try again.');
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl">
      {/* Back link */}
      <Link
        to={courseId ? `/courses/${courseId}` : '/courses'}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-stone-600 dark:hover:text-ink-soft transition-colors mb-6"
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
          <div className="p-5 border-t border-line bg-white dark:bg-inset space-y-4">
            <p className="text-xs text-muted">
              Each line is treated as one assignment. Dates like "Jan 15", "2/14", or "March 1st"
              are extracted automatically. Lines with no date will appear in the grid with an empty
              due date for you to fill in.
            </p>

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
                <label className="text-xs text-muted shrink-0">Year</label>
                <input
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
                className="px-4 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Parse &amp; add to grid
              </button>

              <button
                onClick={() => { setImportOpen(false); setSyllabusText(''); }}
                className="text-sm text-muted hover:text-stone-600 dark:hover:text-ink-soft transition-colors"
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
        <div className="grid grid-cols-[1fr_150px_160px_36px] gap-x-2 bg-inset border-b border-line px-4 py-2.5">
          <span className="text-xs font-medium text-muted">Assignment name</span>
          <span className="text-xs font-medium text-muted">Type</span>
          <span className="text-xs font-medium text-muted">Due date</span>
          <span />
        </div>

        {/* Data rows */}
        <div className="divide-y divide-line">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_150px_160px_36px] gap-x-2 items-center px-4 py-2 bg-white dark:bg-inset hover:bg-surface-hi/60 transition-colors"
            >
              <input
                ref={el => { nameRefs.current[row.id] = el; }}
                type="text"
                value={row.name}
                onChange={e => updateRow(row.id, 'name', e.target.value)}
                onKeyDown={e => handleNameKey(e, row.id)}
                placeholder={`Assignment ${idx + 1}`}
                className={INPUT}
              />
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
                onKeyDown={e => handleDateKey(e, row.id)}
                className={cn(INPUT, !row.dueDate && row.name && 'border-amber-300 dark:border-amber-700')}
              />
              <button
                onClick={() => removeRow(row.id)}
                className="p-1 text-muted hover:text-red-400 dark:hover:text-red-400 rounded transition-colors"
                title="Remove row"
                tabIndex={-1}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Add row */}
        <button
          onClick={() => addRowAfter()}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted hover:text-stone-600 dark:hover:text-ink-soft hover:bg-surface-hi transition-colors border-t border-line"
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
          className="px-5 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? 'Saving…'
            : `Save ${validRows.length} assignment${validRows.length !== 1 ? 's' : ''}`}
        </button>
        <Link
          to={courseId ? `/courses/${courseId}` : '/courses'}
          className="px-4 py-2 text-sm text-muted hover:text-stone-700 dark:hover:text-ink-soft transition-colors"
        >
          Cancel
        </Link>
        <span className="text-xs text-muted ml-2">
          Enter to jump rows · Tab to move between fields
        </span>
      </div>
    </div>
  );
}
