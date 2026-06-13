// Preset BlockNote documents for note templates. Pure data (serialized block JSON), no
// electron/node imports. Phase 3 expands this (Cornell, Reading, Study guide); Phase 2 uses
// the lecture template for one-click lecture notes.

interface Block {
  type: string;
  props?: Record<string, unknown>;
  content?: { type: 'text'; text: string; styles: Record<string, never> }[];
}

function heading(text: string, level = 3): Block {
  return { type: 'heading', props: { level }, content: [{ type: 'text', text, styles: {} }] };
}
function bullet(): Block {
  return { type: 'bulletListItem', content: [] };
}

/** A lecture-note skeleton: Key points + Questions sections, each with an empty bullet. */
export function lectureTemplate(): string {
  return JSON.stringify([heading('Key points'), bullet(), heading('Questions'), bullet()]);
}
