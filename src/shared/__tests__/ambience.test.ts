import { describe, it, expect } from 'vitest';
import { fillWhiteNoise, fillBrownNoise, fillPinkNoise, AMBIENCE_SOUNDS } from '../ambience';

// A tiny seeded PRNG (mulberry32) so the generators are deterministic in tests.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function meanAdjacentDelta(data: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < data.length; i++) sum += Math.abs(data[i] - data[i - 1]);
  return sum / (data.length - 1);
}

const N = 4096;

describe('ambience noise generators', () => {
  it('registry ids are unique', () => {
    const ids = AMBIENCE_SOUNDS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every generator stays within [-1, 1] (headroom, never clips)', () => {
    for (const fill of [fillWhiteNoise, fillBrownNoise, fillPinkNoise]) {
      const buf = new Float32Array(N);
      fill(buf, seeded(1));
      expect(buf.every(x => x >= -1 && x <= 1)).toBe(true);
      // ...and normalization pushes the peak up to the 0.9 target (not near-silent).
      const peak = buf.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      expect(peak).toBeCloseTo(0.9, 5);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = new Float32Array(N); fillPinkNoise(a, seeded(42));
    const b = new Float32Array(N); fillPinkNoise(b, seeded(42));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('brown is far smoother (more low-frequency) than white', () => {
    const white = new Float32Array(N); fillWhiteNoise(white, seeded(7));
    const brown = new Float32Array(N); fillBrownNoise(brown, seeded(7));
    // Adjacent samples change much less in brown noise — its energy sits low.
    expect(meanAdjacentDelta(brown)).toBeLessThan(meanAdjacentDelta(white));
  });

  it('pink sits between white and brown in smoothness', () => {
    const white = new Float32Array(N); fillWhiteNoise(white, seeded(3));
    const pink  = new Float32Array(N); fillPinkNoise(pink,  seeded(3));
    const brown = new Float32Array(N); fillBrownNoise(brown, seeded(3));
    const w = meanAdjacentDelta(white), p = meanAdjacentDelta(pink), b = meanAdjacentDelta(brown);
    expect(p).toBeLessThan(w);
    expect(p).toBeGreaterThan(b);
  });
});
