import { describe, it, expect } from 'vitest';
import { blocksToPlainText, noteTitleFromBlocks } from '../notes';

// A small but realistic BlockNote document covering the shapes the walker must handle:
// styled inline runs, a link, nested children, and a table.
const doc = JSON.stringify([
  {
    id: '1',
    type: 'heading',
    props: { level: 1 },
    content: [{ type: 'text', text: 'Graph Theory', styles: {} }],
    children: [],
  },
  {
    id: '2',
    type: 'paragraph',
    content: [
      { type: 'text', text: 'A graph is a set of ', styles: {} },
      { type: 'text', text: 'vertices', styles: { bold: true } },
      { type: 'text', text: ' and edges. See ', styles: {} },
      { type: 'link', href: 'https://x', content: [{ type: 'text', text: 'docs', styles: {} }] },
    ],
    children: [
      {
        id: '3',
        type: 'paragraph',
        content: [{ type: 'text', text: 'nested note', styles: {} }],
        children: [],
      },
    ],
  },
  {
    id: '4',
    type: 'table',
    content: {
      type: 'tableContent',
      rows: [
        { cells: [[{ type: 'text', text: 'Term', styles: {} }], [{ type: 'text', text: 'Defn', styles: {} }]] },
      ],
    },
    children: [],
  },
]);

describe('blocksToPlainText', () => {
  it('returns "" for an empty document', () => {
    expect(blocksToPlainText('[]')).toBe('');
  });

  it('returns "" for invalid JSON', () => {
    expect(blocksToPlainText('not json')).toBe('');
  });

  it('returns "" when the JSON is not an array', () => {
    expect(blocksToPlainText('{"type":"paragraph"}')).toBe('');
  });

  it('extracts and merges styled inline runs into one line per block', () => {
    const text = blocksToPlainText(doc);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Graph Theory');
    expect(lines[1]).toContain('A graph is a set of vertices and edges. See docs');
  });

  it('includes link text and nested children', () => {
    const text = blocksToPlainText(doc);
    expect(text).toContain('docs');
    expect(text).toContain('nested note');
  });

  it('includes table cell text', () => {
    const text = blocksToPlainText(doc);
    expect(text).toContain('Term');
    expect(text).toContain('Defn');
  });
});

describe('noteTitleFromBlocks', () => {
  it('returns the first non-empty line of text', () => {
    expect(noteTitleFromBlocks(doc)).toBe('Graph Theory');
  });

  it('returns "" when there is no text', () => {
    expect(noteTitleFromBlocks('[]')).toBe('');
  });

  it('truncates long first lines with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const blocks = JSON.stringify([
      { id: '1', type: 'paragraph', content: [{ type: 'text', text: long, styles: {} }], children: [] },
    ]);
    const title = noteTitleFromBlocks(blocks, 80);
    expect(title.length).toBe(81); // 80 chars + ellipsis
    expect(title.endsWith('…')).toBe(true);
  });
});
