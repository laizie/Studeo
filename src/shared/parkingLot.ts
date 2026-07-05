// Distraction parking lot → loose note.
//
// During a focus block, intrusive thoughts ("reply to mom", "look up that thing")
// get parked instead of acted on. When the session ends we dump them into a single
// loose note so they're not lost and don't nag. This module builds that note's
// title + serialized BlockNote document. Pure — no electron/node — so it's
// unit-testable and portable (mirrors shared/notes.ts, shared/noteTemplates.ts).

// The subset of a BlockNote block we emit. `content` is inline text runs; `props`
// carries per-type settings (e.g. a checklist item's checked flag). Missing props
// are normalized to their defaults when BlockNote loads the document — the note
// templates rely on the same partial-props behavior.
interface Block {
  type: string;
  props?: Record<string, unknown>;
  content: { type: 'text'; text: string; styles: Record<string, never> }[];
}

function paragraph(text: string): Block {
  return { type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [] };
}

// A checklist item (unchecked) — parked thoughts are to-dos you tick off later.
function checkItem(text: string): Block {
  return { type: 'checkListItem', props: { checked: false }, content: [{ type: 'text', text, styles: {} }] };
}

/** "Parked thoughts · Jul 5" — the loose note's title. */
export function parkingLotNoteTitle(now: Date = new Date()): string {
  return `Parked thoughts · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Build the loose note for a batch of parked thoughts, or null when there's nothing
 * worth saving (all blank). Blank/whitespace-only entries are dropped and each kept
 * thought becomes an unchecked checklist item under a short provenance line.
 */
export function buildParkingLotNote(
  thoughts: string[],
  now: Date = new Date(),
): { title: string; contentJson: string } | null {
  const cleaned = thoughts.map(t => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  const when = now.toLocaleString('en-US', {
    month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const blocks: Block[] = [
    paragraph(`Captured during a focus session · ${when}`),
    ...cleaned.map(checkItem),
  ];

  return { title: parkingLotNoteTitle(now), contentJson: JSON.stringify(blocks) };
}
