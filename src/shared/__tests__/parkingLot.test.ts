import { describe, it, expect } from 'vitest';
import { buildParkingLotNote, parkingLotNoteTitle } from '../parkingLot';

const NOW = new Date(2026, 6, 5, 15, 40); // Jul 5 2026, 3:40 PM local

// Small helper: parse the built document back to blocks.
function blocksOf(contentJson: string): { type: string; props?: Record<string, unknown>; content: { text?: string }[] }[] {
  return JSON.parse(contentJson);
}

describe('buildParkingLotNote', () => {
  it('returns null when there is nothing to save', () => {
    expect(buildParkingLotNote([], NOW)).toBeNull();
    expect(buildParkingLotNote(['   ', '', '\t'], NOW)).toBeNull();
  });

  it('titles the note with the date', () => {
    const note = buildParkingLotNote(['reply to mom'], NOW);
    expect(note!.title).toBe(parkingLotNoteTitle(NOW));
    expect(note!.title).toContain('Jul 5');
  });

  it('makes one unchecked checklist item per thought', () => {
    const note = buildParkingLotNote(['reply to mom', 'look up that thing'], NOW)!;
    const checks = blocksOf(note.contentJson).filter(b => b.type === 'checkListItem');
    expect(checks).toHaveLength(2);
    expect(checks.map(c => c.content[0].text)).toEqual(['reply to mom', 'look up that thing']);
    expect(checks.every(c => c.props?.checked === false)).toBe(true);
  });

  it('leads with a provenance paragraph', () => {
    const blocks = blocksOf(buildParkingLotNote(['x'], NOW)!.contentJson);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('trims whitespace and drops blank entries', () => {
    const note = buildParkingLotNote(['  spaced out  ', '', 'kept'], NOW)!;
    const checks = blocksOf(note.contentJson).filter(b => b.type === 'checkListItem');
    expect(checks.map(c => c.content[0].text)).toEqual(['spaced out', 'kept']);
  });
});
