// ───────────────────────────────────────────────────────────────────────────
// THROWAWAY M0 SPIKE — DELETE BEFORE M1.
// Purpose: validate BlockNote end-to-end before any real Notes code:
//   1. Does it render + edit in our Electron renderer (React 19)?
//   2. Can we theme it onto Studeo's CSS tokens (warm-dark) cleanly?
//   3. Does the Shiki-powered code block work (syntax highlighting)?
//   4. What does it cost in bundle size? (measured via a renderer build)
// Reached at route #/notes-spike. Not linked in the sidebar.
// ───────────────────────────────────────────────────────────────────────────
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { codeBlockOptions } from '@blocknote/code-block';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import '@blocknote/core/fonts/inter.css';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import '@blocknote/mantine/style.css';

// Real-world theming approach (plan §7.6): override BlockNote's own CSS variables
// with Studeo's design tokens, scoped to the editor container. No TS theme object,
// no duplicated hex — it follows the app's light/dark token flip for free.
const TOKEN_BRIDGE = `
.studeo-bn .bn-container {
  --bn-colors-editor-background: var(--bg);
  --bn-colors-editor-text: var(--ink);
  --bn-colors-menu-background: var(--surface);
  --bn-colors-menu-text: var(--ink);
  --bn-colors-tooltip-background: var(--surface-hi);
  --bn-colors-tooltip-text: var(--ink);
  --bn-colors-hovered-background: var(--surface-hi);
  --bn-colors-hovered-text: var(--ink);
  --bn-colors-selected-background: var(--accent);
  --bn-colors-selected-text: var(--accent-ink);
  --bn-colors-disabled-background: var(--inset);
  --bn-colors-disabled-text: var(--muted);
  --bn-colors-border: var(--line);
  --bn-colors-side-menu: var(--muted);
  --bn-border-radius: 8px;
}
`;

const INITIAL = [
  { type: 'heading', props: { level: 1 }, content: 'Spike: BlockNote in Studeo' },
  { type: 'paragraph', content: 'Type "/" for the slash menu. Hover a block for the drag handle. Try bold, a checklist, a callout, a table.' },
  { type: 'paragraph', content: 'Below is a code block (Shiki highlighting):' },
  {
    type: 'codeBlock',
    props: { language: 'typescript' },
    content: "function deadlineLabel(due: Date): string {\n  return due < new Date() ? 'overdue' : 'upcoming';\n}",
  },
] as const;

export default function NotesSpike() {
  const editor = useCreateBlockNote({
    codeBlock: codeBlockOptions, // Shiki-powered highlighting (via @blocknote/code-block)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: INITIAL as any,
  });

  return (
    <div className="h-full overflow-auto bg-bg p-8">
      <style>{TOKEN_BRIDGE}</style>
      <div className="mx-auto max-w-[720px]">
        <div className="mb-4 rounded-lg border border-line bg-inset px-3 py-2 text-xs text-muted">
          THROWAWAY M0 SPIKE — validates editor, theming, and code block. Delete before M1.
        </div>
        <div className="studeo-bn">
          <BlockNoteView editor={editor} theme="dark" />
        </div>
      </div>
    </div>
  );
}
