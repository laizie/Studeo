import { useEffect, useRef, useState } from 'react';
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { filterSuggestionItems } from '@blocknote/core';
import { History, CalendarDays, X } from 'lucide-react';
import { studeoCodeBlock } from './codeBlock';
import ImageLightbox from './ImageLightbox';
import NoteLinkBar from './NoteLinkBar';
import LinkPickerDialog, { type PickItem } from './LinkPickerDialog';
import VersionHistoryDialog from './VersionHistoryDialog';
import { studeoSlashItems } from './noteSlashItems';
import { useUpdateNote, useRestoreNoteVersion } from '../../lib/queries/useNotes';
import { useCreateNoteLink } from '../../lib/queries/useNoteLinks';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useCreateTask } from '../../lib/queries/useTasks';
import { useSettingsStore } from '../../store/useSettingsStore';
import { computeDeadlineLabel, formatDueDate } from '../../../shared/deadlines';
import type { Note, NoteVersion } from '../../../shared/types';
import './blocknote-theme.css';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import '@blocknote/core/fonts/inter.css';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import '@blocknote/mantine/style.css';

const AUTOSAVE_MS = 600;

// Best-effort file extension: prefer the filename, fall back to the MIME subtype
// (e.g. a pasted screenshot arrives as "image/png" with no name). Main validates it.
function fileExt(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
  if (fromName) return fromName;
  const sub = file.type.split('/')[1] ?? '';
  return sub;
}

// Today as a local YYYY-MM-DD (tasks store a date-only due date).
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Plain text of a BlockNote block's inline content. The content shape is BlockNote-internal,
// so this reads it loosely rather than importing its generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BlockNote inline content is loosely typed here
function blockPlainText(content: any): string {
  if (!Array.isArray(content)) return '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inline item shape varies (text/link)
  return content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('').trim();
}

// A note with an empty/blank document should start with BlockNote's default empty paragraph
// (pass undefined), not an empty array — an empty array is not valid initial content.
function parseInitial(contentJson: string) {
  try {
    const blocks = JSON.parse(contentJson);
    return Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The editing surface for a single note. Mounted with `key={note.id}` by the page so that
 * switching notes remounts a fresh editor (BlockNote's initial content is set once at
 * creation). Saves are debounced and also flushed on unmount (navigate-away).
 */
export default function NoteEditor({ note }: { note: Note }) {
  const theme = useSettingsStore((s) => s.theme);
  const updateNote = useUpdateNote();
  const linkNote = useCreateNoteLink();
  const createTask = useCreateTask();
  const restoreVersion = useRestoreNoteVersion();
  const { data: courses } = useCourses();
  const { data: assignments } = useAssignments();

  // "Untitled" is the DB default/placeholder — show it as an empty field, not literal text.
  const initialTitle = note.title === 'Untitled' ? '' : note.title;
  const [title, setTitle] = useState(initialTitle);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // Slash-command UI: which link picker is open, the /Due date prompt, and a transient toast.
  const [picker, setPicker] = useState<'course' | 'assignment' | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(note.note_date);
  const [flash, setFlash] = useState<string | null>(null);

  function showFlash(message: string) {
    setFlash(message);
    setTimeout(() => setFlash((m) => (m === message ? null : m)), 2200);
  }

  const editor = useCreateBlockNote({
    codeBlock: studeoCodeBlock,
    initialContent: parseInitial(note.content_json),
    // Drag-drop / paste / file-picker all funnel here. We persist the bytes via the media
    // IPC and hand BlockNote back a studeo-asset:// URL to store in the image block.
    uploadFile: async (file: File) => {
      const data = new Uint8Array(await file.arrayBuffer());
      return window.api.media.save({ noteId: note.id, ext: fileExt(file), data });
    },
  });

  // ── Debounced content autosave ──────────────────────────────────────────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const latestJson = useRef(note.content_json);
  // Keep mutate in a ref so the unmount-flush effect can stay [] without going stale.
  const mutate = useRef(updateNote.mutate);
  mutate.current = updateNote.mutate;

  function flushContent() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    mutate.current({ id: note.id, input: { contentJson: latestJson.current } });
  }

  function handleChange() {
    latestJson.current = JSON.stringify(editor.document);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flushContent, AUTOSAVE_MS);
  }

  // Flush any pending edit when the editor unmounts (route change / app close).
  // Runs once: mutate is read through a ref, so an empty dep list can't go stale.
  useEffect(() => {
    return () => flushContent();
  }, []);

  function saveTitle() {
    if (title.trim() === initialTitle) return;
    updateNote.mutate({ id: note.id, input: { title } });
  }

  // Setting a date places this note on its class Timeline (in the matching week); clearing
  // it moves the note back to the freeform Pages list.
  function applyNoteDate(date: string | null) {
    setDateOpen(false);
    setNoteDate(date);
    updateNote.mutate({ id: note.id, input: { noteDate: date } });
    if (date) showFlash('Added to the class timeline');
  }

  // ── Slash-command actions ─────────────────────────────────────────────────────
  function linkSelected(entityType: 'course' | 'assignment', entityId: string) {
    linkNote.mutate({ noteId: note.id, entityType, entityId });
    setPicker(null);
    showFlash(entityType === 'course' ? 'Linked to course' : 'Linked to assignment');
  }

  function insertDue(date: string) {
    setDueOpen(false);
    if (!date) return;
    const info = computeDeadlineLabel(date);
    editor.insertInlineContent([
      { type: 'text', text: `📅 Due ${formatDueDate(date)} · ${info.label}`, styles: { bold: true } },
      ' ', // trailing plain space so typing continues un-bolded
    ]);
  }

  function checklistToTask() {
    const text = blockPlainText(editor.getTextCursorPosition().block.content);
    if (!text) { showFlash('Nothing on this line to add'); return; }
    createTask.mutate({ name: text, dueDate: todayStr() });
    showFlash('Added to Tasks (due today)');
  }

  const slashActions = {
    onLinkCourse: () => setPicker('course'),
    onLinkAssignment: () => setPicker('assignment'),
    onInsertDue: () => setDueOpen(true),
    onChecklistToTask: checklistToTask,
  };

  // Restore a snapshot: the backend swaps the stored content (snapshotting current first so
  // it's reversible), then we sync the LIVE editor via replaceBlocks — no remount, so the
  // unmount-flush can't clobber the restored content.
  async function handleRestore(version: NoteVersion) {
    setRestoringId(version.id);
    try {
      const restored = await restoreVersion.mutateAsync({ noteId: note.id, versionId: version.id });
      const blocks = parseInitial(restored.content_json) ?? [{ type: 'paragraph' }];
      editor.replaceBlocks(editor.document, blocks);
      latestJson.current = restored.content_json;
      dirty.current = false;
      setHistoryOpen(false);
      showFlash('Restored earlier version');
    } finally {
      setRestoringId(null);
    }
  }

  const courseItems: PickItem[] = (courses ?? []).map((c) => ({
    id: c.id, label: c.name, sublabel: c.abbreviation,
  }));
  const assignmentItems: PickItem[] = (assignments ?? []).map((a) => ({
    id: a.id, label: a.name, sublabel: courses?.find((c) => c.id === a.course_id)?.abbreviation,
  }));

  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <div className="mb-2 flex items-center justify-end gap-1">
        <button
          onClick={() => setDateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-hi hover:text-ink transition-colors"
          title="Set a date to place this note on the class timeline"
        >
          <CalendarDays size={13} />
          {noteDate ? formatDueDate(noteDate) : 'Set date'}
        </button>
        {noteDate && (
          <button
            onClick={() => applyNoteDate(null)}
            className="rounded-md p-1 text-muted hover:bg-surface-hi hover:text-ink transition-colors"
            title="Remove from timeline"
            aria-label="Remove date"
          >
            <X size={12} />
          </button>
        )}
        <button
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-hi hover:text-ink transition-colors"
          title="Version history"
        >
          <History size={13} />
          History
        </button>
      </div>
      <NoteLinkBar noteId={note.id} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Untitled"
        aria-label="Note title"
        className="mb-3 w-full bg-transparent text-3xl font-bold text-ink placeholder:text-muted focus:outline-none"
      />
      <div
        className="studeo-bn"
        onDoubleClick={(e) => {
          // Double-click an image to preview it full-screen (single click stays free for
          // BlockNote's own select/resize handling).
          const target = e.target as HTMLElement;
          if (target.tagName === 'IMG') setLightboxSrc((target as HTMLImageElement).src);
        }}
      >
        <BlockNoteView
          editor={editor}
          theme={theme === 'light' ? 'light' : 'dark'}
          onChange={handleChange}
          slashMenu={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [...getDefaultReactSlashMenuItems(editor), ...studeoSlashItems(slashActions)],
                query,
              )
            }
          />
        </BlockNoteView>
      </div>

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {picker === 'course' && (
        <LinkPickerDialog
          title="Link a course"
          items={courseItems}
          onSelect={(id) => linkSelected('course', id)}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'assignment' && (
        <LinkPickerDialog
          title="Link an assignment"
          items={assignmentItems}
          onSelect={(id) => linkSelected('assignment', id)}
          onClose={() => setPicker(null)}
        />
      )}
      {dueOpen && <DueDatePrompt onConfirm={insertDue} onClose={() => setDueOpen(false)} />}
      {dateOpen && (
        <DueDatePrompt
          title="Note date"
          confirmLabel="Set"
          initial={noteDate ?? ''}
          onConfirm={applyNoteDate}
          onClose={() => setDateOpen(false)}
        />
      )}
      {historyOpen && (
        <VersionHistoryDialog
          noteId={note.id}
          restoringId={restoringId}
          onRestore={handleRestore}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {flash && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-bg shadow-lg">
          {flash}
        </div>
      )}
    </div>
  );
}

/** Minimal date prompt, reused by the /Due slash command and the note-date control. */
function DueDatePrompt({
  onConfirm,
  onClose,
  title = 'Due date',
  confirmLabel = 'Insert',
  initial = '',
}: {
  onConfirm: (date: string) => void;
  onClose: () => void;
  title?: string;
  confirmLabel?: string;
  initial?: string;
}) {
  const [date, setDate] = useState(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-xs mx-4 rounded-2xl bg-surface p-5 shadow-2xl">
        <label className="mb-2 block text-sm font-medium text-ink-soft">{title}</label>
        <input
          type="date"
          autoFocus
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-muted hover:text-ink transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(date)}
            disabled={!date}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-ink hover:bg-accent-deep disabled:opacity-50 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
