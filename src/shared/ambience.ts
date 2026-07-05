// Ambient sound for Focus Mode — the sound registry + the pure noise generators.
//
// We SYNTHESIZE ambience at runtime with the Web Audio API instead of shipping audio
// files: it's 0 KB of assets, works fully offline, loops seamlessly, and needs no
// licensing. The actual Web Audio graph (filters, LFOs, playback) lives in the
// renderer — see features/study/ambience/ambienceEngine.ts. This file stays pure
// (no Web Audio, no DOM), so the noise math is unit-testable and the metadata is
// importable anywhere. Real recorded loops (e.g. a true café) could later be added
// as an extra source type without touching this math.

export type AmbienceId = 'rain' | 'wind' | 'brown' | 'white';

export interface AmbienceSound {
  id: AmbienceId;
  label: string;
  /** One-line description, used for the control's title/aria text. */
  description: string;
}

export const AMBIENCE_SOUNDS: AmbienceSound[] = [
  { id: 'rain',  label: 'Rain',  description: 'Soft, steady rainfall' },
  { id: 'wind',  label: 'Wind',  description: 'Slow gusting wind' },
  { id: 'brown', label: 'Brown', description: 'Deep, warm rumble' },
  { id: 'white', label: 'White', description: 'Bright, even hiss' },
];

// Scale a buffer so its loudest sample sits at `peak`, leaving a little headroom so
// the audio hardware never clips. A silent buffer is left untouched.
function normalizeInPlace(data: Float32Array, peak = 0.9): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > max) max = a;
  }
  if (max === 0) return;
  const scale = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}

/** White noise: each sample independent and uniform — a flat, bright hiss. */
export function fillWhiteNoise(data: Float32Array, rng: () => number = Math.random): void {
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  normalizeInPlace(data);
}

/**
 * Brown (red) noise: white noise run through a leaky integrator. Integrating piles
 * energy into the low end (a 1/f² spectrum) for a deep rumble; the small leak keeps
 * it bounded and free of runaway DC. Adjacent samples are strongly correlated — the
 * property the tests lean on to tell it apart from white.
 */
export function fillBrownNoise(data: Float32Array, rng: () => number = Math.random): void {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = rng() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last;
  }
  normalizeInPlace(data);
}

/**
 * Pink noise via Paul Kellet's economical filter (a 1/f spectrum — halfway between
 * white and brown). It's the most natural-sounding base for rainfall.
 */
export function fillPinkNoise(data: Float32Array, rng: () => number = Math.random): void {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  normalizeInPlace(data);
}
