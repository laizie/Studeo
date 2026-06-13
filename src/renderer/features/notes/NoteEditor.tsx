import { useEffect, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { studeoCodeBlock } from './codeBlock';
import { useUpdateNote } from '../../lib/queries/useNotes';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { Note } from '../../../shared/types';
import './blocknote-theme.css';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import '@blocknote/core/fonts/inter.css';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import '@blocknote/mantine/style.css';

const AUTOSAVE_MS = 600;

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

  // "Untitled" is the DB default/placeholder — show it as an empty field, not literal text.
  const initialTitle = note.title === 'Untitled' ? '' : note.title;
  const [title, setTitle] = useState(initialTitle);

  const editor = useCreateBlockNote({
    codeBlock: studeoCodeBlock,
    initialContent: parseInitial(note.content_json),
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

  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
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
      <div className="studeo-bn">
        <BlockNoteView
          editor={editor}
          theme={theme === 'light' ? 'light' : 'dark'}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
