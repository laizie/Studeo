// Preset BlockNote documents for note templates. Pure data (serialized block JSON), no
// electron/node imports.
//
// Note on Cornell: true Cornell notes are a two-column (cue | notes) layout. BlockNote 0.51
// core has no column block (columns live in a separate paid/experimental package we haven't
// added), so we use a sectioned fallback — Cues / Notes / Summary headings — which captures
// the method without the columns.

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
function paragraph(text = ''): Block {
  return { type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [] };
}

export type TemplateId = 'blank' | 'lecture' | 'cornell' | 'reading' | 'studyGuide';

export interface NoteTemplate {
  id: TemplateId;
  label: string;
  description: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  { id: 'blank', label: 'Blank', description: 'Start from nothing' },
  { id: 'lecture', label: 'Lecture', description: 'Key points · questions' },
  { id: 'cornell', label: 'Cornell', description: 'Cues · notes · summary' },
  { id: 'reading', label: 'Reading', description: 'Source · summary · quotes' },
  { id: 'studyGuide', label: 'Study guide', description: 'Topics · practice questions' },
];

/** The lecture-note skeleton (also used by one-click lecture capture). */
export function lectureTemplate(): string {
  return JSON.stringify([heading('Key points'), bullet(), heading('Questions'), bullet()]);
}

/** Serialized block JSON for a given template id. */
export function templateContent(id: TemplateId): string {
  switch (id) {
    case 'lecture':
      return lectureTemplate();
    case 'cornell':
      return JSON.stringify([
        heading('Cues'), bullet(),
        heading('Notes'), bullet(),
        heading('Summary'), paragraph(),
      ]);
    case 'reading':
      return JSON.stringify([
        heading('Source'), paragraph(),
        heading('Summary'), bullet(),
        heading('Key quotes'), bullet(),
      ]);
    case 'studyGuide':
      return JSON.stringify([
        heading('Topics to review'), bullet(),
        heading('Practice questions'), bullet(),
        paragraph('Tip: type "/" → Link notes to pull in your lecture and reading notes.'),
      ]);
    case 'blank':
    default:
      return '[]';
  }
}
