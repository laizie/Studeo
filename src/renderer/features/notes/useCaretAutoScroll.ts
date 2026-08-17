import { useEffect, type RefObject } from 'react';

/**
 * Keep the text caret inside the visible part of the scroll container while typing.
 *
 * Why this is needed at all: a browser only auto-scrolls to the caret for its own
 * built-in editing, and even then it stops at the *nearest* scrollport. Here the
 * note editor is a contenteditable inside a padded "paper" sheet inside the page's
 * own `overflow-auto` region, so once you typed past the fold the caret just kept
 * going below the window and you had to scroll by hand mid-sentence.
 *
 * Deliberately driven by typing (`input` + `keydown`), not by `selectionchange`:
 * clicking near the bottom of a note is a normal thing to do and shouldn't yank
 * the page, whereas typing off the bottom edge always should.
 */

/** Room kept below the caret. Sized to the sheet's own bottom padding — asking
 *  for more than the document can offer just clamps, which reads as "it stopped
 *  scrolling for no reason" on the last line. */
const BOTTOM_MARGIN = 72;
/** Kept small: this only rescues a caret that has gone off the top edge (⌘↑,
 *  wrapping back up a paragraph), and a large value would fight ordinary edits. */
const TOP_MARGIN = 24;

/** The closest ancestor that actually scrolls. Walked rather than assumed: the
 *  editor is mounted by NoteEditorPage today, but the scrollport is that page's
 *  business, not the editor's. */
function nearestScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Where the caret is on screen. A collapsed range at the start of an empty block
 *  has no client rects at all, hence the walk out to the containing element. */
function caretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];

  const bounds = range.getBoundingClientRect();
  if (bounds.height > 0) return bounds;

  const node = range.startContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.getBoundingClientRect() ?? null;
}

export function useCaretAutoScroll(hostRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let frame = 0;

    // An arrow bound after the null guard, not a hoisted `function` — a hoisted
    // declaration could in principle run before the guard, so it wouldn't see
    // `host` as non-null.
    const keepCaretVisible = () => {
      // On keydown the caret hasn't moved yet, and on input the layout hasn't
      // settled — so measure on the next frame, and only once per frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection?.focusNode || !host.contains(selection.focusNode)) return;

        const container = nearestScrollParent(host);
        const rect = caretRect();
        if (!container || !rect) return;

        const view = container.getBoundingClientRect();
        const belowFold = rect.bottom - (view.bottom - BOTTOM_MARGIN);
        const aboveFold = view.top + TOP_MARGIN - rect.top;

        if (belowFold > 0) {
          container.scrollTop += belowFold;
        } else if (aboveFold > 0) {
          // Never scroll past the top of the document — `scrollTop` would clamp
          // anyway, but subtracting more than we have makes the intent murky.
          container.scrollTop -= Math.min(aboveFold, container.scrollTop);
        }
      });
    };

    host.addEventListener('input', keepCaretVisible);
    host.addEventListener('keydown', keepCaretVisible);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener('input', keepCaretVisible);
      host.removeEventListener('keydown', keepCaretVisible);
    };
  }, [hostRef]);
}
