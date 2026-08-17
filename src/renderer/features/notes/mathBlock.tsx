import { useEffect, useMemo, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import type { BlockNoteEditor } from '@blocknote/core';
import katex from 'katex';
// eslint-disable-next-line import/no-unresolved -- Vite resolves CSS side-effect imports at build time
import 'katex/dist/katex.min.css';

/**
 * A display-math block: you type LaTeX, it renders as a centred equation.
 *
 * Why a custom block at all — BlockNote has no math of its own, and a code block
 * set to `latex` only ever shows you the source. For a stats or calculus class
 * the *rendered* formula is the note; the source is scaffolding you want to stop
 * looking at the moment it's right.
 *
 * Why the LaTeX lives in a **prop** (`content: 'none'`) rather than as the
 * block's inline content: LaTeX is source, not prose. Held as inline content,
 * ProseMirror would happily let bold, links and autocorrect into the middle of a
 * `\frac`, and every rich-text feature in the editor would apply to it. As an
 * opaque prop the block owns its own plain-text editing surface (a textarea) and
 * the rest of the editor leaves the source alone.
 */

/** Render LaTeX to HTML. `throwOnError: false` makes KaTeX draw the bad bit in
 *  red instead of exploding — the note keeps rendering while you fix a typo.
 *  `trust` stays at its default `false`, so \href/\htmlClass and friends are
 *  refused: note content is user data, and this output is set as innerHTML. */
function renderLatex(latex: string): string {
  return katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    output: 'html',
  });
}

function MathBlockView({
  latex,
  startEditing,
  onChange,
  onDone,
}: {
  latex: string;
  /** A block inserted from the slash menu opens straight into its editor —
   *  otherwise you'd land on an empty equation with nothing to type into. */
  startEditing: boolean;
  onChange: (latex: string) => void;
  /** Hand the caret back to the prose below. Called only when the user says
   *  they're finished (Esc / ⌘↵) — never on blur, which would yank focus away
   *  from wherever they just clicked. */
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Rendering is pure and cheap, but it runs on every keystroke while the live
  // preview is up, so memoise on the source.
  const html = useMemo(() => renderLatex(draft), [draft]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // Grow the source box with its content — LaTeX wraps badly, and a fixed two
  // rows means a long integrand scrolls out of sight as you type it.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  function commit({ moveOn }: { moveOn: boolean }) {
    setEditing(false);
    if (draft !== latex) onChange(draft);
    if (moveOn) onDone();
  }

  if (editing) {
    return (
      // contentEditable={false} keeps ProseMirror's hands off this subtree: without
      // it the editor treats the textarea's keystrokes as document edits.
      <div className="studeo-math studeo-math--editing" contentEditable={false}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit({ moveOn: false })}
          onKeyDown={(e) => {
            // Escape and ⌘/Ctrl+Enter both mean "done". Plain Enter stays a
            // newline: multi-line LaTeX (align, cases, matrices) is the norm.
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              commit({ moveOn: true });
            }
            e.stopPropagation();
          }}
          spellCheck={false}
          placeholder="\int_0^1 x^2 \,dx = \frac{1}{3}"
          aria-label="LaTeX source"
          rows={1}
          className="studeo-math__source"
        />
        <div className="studeo-math__preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="studeo-math__hint">LaTeX · Esc or ⌘↵ to render</p>
      </div>
    );
  }

  return (
    <div
      className="studeo-math"
      contentEditable={false}
      role="button"
      tabIndex={0}
      aria-label={latex ? `Equation: ${latex}` : 'Empty equation'}
      onClick={() => { setDraft(latex); setEditing(true); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDraft(latex);
          setEditing(true);
        }
      }}
    >
      {latex.trim() ? (
        <div className="studeo-math__rendered" dangerouslySetInnerHTML={{ __html: renderLatex(latex) }} />
      ) : (
        <p className="studeo-math__empty">Empty equation — click to write LaTeX</p>
      )}
    </div>
  );
}

export const mathBlockSpec = createReactBlockSpec(
  {
    type: 'math',
    content: 'none',
    propSchema: {
      latex: { default: '' as string },
    },
  },
  {
    render: ({ block, editor }) => (
      <MathBlockView
        latex={block.props.latex}
        startEditing={block.props.latex === ''}
        onChange={(latex) => editor.updateBlock(block, { props: { latex } })}
        onDone={() => {
          // A `content: 'none'` block can't hold the caret, so finishing an
          // equation would otherwise leave focus nowhere and the next thing you
          // typed went into the void. Put the caret on the following block —
          // adding one when the equation is the last thing in the note.
          //
          // The widening cast is BlockNote's typing, not a real mismatch: the
          // `editor` handed to a custom block's render is typed against a schema
          // containing only *that* block, so it rejects `{ type: 'paragraph' }`
          // even though the runtime editor is the whole document's and has the
          // full schema. Cast once, here, rather than sprinkling `any`.
          const host = editor as unknown as BlockNoteEditor;
          const doc = host.document;
          const index = doc.findIndex((b) => b.id === block.id);
          const next = index === -1 ? undefined : doc[index + 1];
          const target = next ?? host.insertBlocks([{ type: 'paragraph' }], block.id, 'after')[0];
          host.setTextCursorPosition(target, 'start');
          host.focus();
        }}
      />
    ),
    // Copying a note out of the app (or exporting it) should carry the source,
    // not KaTeX's span soup — `$$…$$` is what every other tool understands.
    toExternalHTML: ({ block }) => <pre>{`$$\n${block.props.latex}\n$$`}</pre>,
  },
)();
