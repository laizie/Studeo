import { describe, it, expect } from 'vitest';
import { mirrorLooksCorrupt } from '../index';

// The gate that finally stops the duplicate runaway. It has to be answerable
// with ONE Apple Event, because every richer question about a broken list is
// too slow to ask: the first attempt read the whole list to adopt orphans,
// which took >120s on a real 1000-item list, hit the 20s timeout every pass,
// returned nothing, and let creation carry on exactly as before.

describe('mirrorLooksCorrupt', () => {
  it('accepts a healthy mirror, one reminder per assignment', () => {
    expect(mirrorLooksCorrupt(125, 125)).toBe(false);
    expect(mirrorLooksCorrupt(0, 125)).toBe(false);
  });

  it('tolerates ordinary drift', () => {
    // A reminder added by hand, or one left behind by an assignment deleted
    // while its reminder was still ticked off. Being wrong in this direction
    // only costs a sync, so the slack is deliberately generous.
    expect(mirrorLooksCorrupt(140, 125)).toBe(false);
    expect(mirrorLooksCorrupt(30, 5)).toBe(false);
  });

  it('rejects the wreckage the duplicate bug leaves behind', () => {
    // The real numbers this was found with: 316 for 125 assignments, then
    // 1053 an hour later while the sync kept running.
    expect(mirrorLooksCorrupt(316, 125)).toBe(true);
    expect(mirrorLooksCorrupt(1053, 125)).toBe(true);
  });

  it('does not trip on a small library where doubling is still small', () => {
    // Two assignments and five reminders is odd but not evidence of a runaway,
    // and refusing to sync a brand-new install would be worse than the drift.
    expect(mirrorLooksCorrupt(5, 2)).toBe(false);
  });

  it('holds the boundary where slack runs out', () => {
    expect(mirrorLooksCorrupt(270, 125)).toBe(false);
    expect(mirrorLooksCorrupt(271, 125)).toBe(true);
  });
});
