import { describe, it, expect } from 'vitest';
import { COURSE_COLORS, courseInk, coursePillBg, contrastTextColor } from '../colors';

// The course pill was the app's worst accessibility bug: raw course color as
// text on a 25%-alpha tint of itself, which is ~1.2:1 for the pastels. The fix
// (colors.ts) mixes both sides against theme tokens. This test is the guardrail:
// it re-derives what the browser's color-mix() will actually paint, in each
// theme, and asserts every palette color clears WCAG AA on its own pill.
//
// If a new course color or a theme's --ink/--inset ever breaks AA, this fails
// here rather than silently shipping an unreadable badge.

// The token values color-mix() resolves against, per theme (src/index.css).
const THEMES = [
  { name: 'light', ink: '#292524', inset: '#f1ebe1' },
  { name: 'dark',  ink: '#f0e0cc', inset: '#1a1410' },
  { name: 'warm',  ink: '#f0e0cc', inset: '#452f1c' },
];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

/** sRGB → linear, per WCAG 2.1. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** What `color-mix(in srgb, <color> <pct>, <base>)` resolves to. */
function colorMix(color: string, pct: number, base: string): RGB {
  const c = hexToRgb(color);
  const b = hexToRgb(base);
  return c.map((v, i) => Math.round(v * pct + b[i] * (1 - pct))) as RGB;
}

/** Pull the color and percentage back out of the helpers' color-mix() strings. */
function parseMix(css: string): { pct: number; token: string } {
  const m = css.match(/color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, var\((--[a-z]+)\)\)/i);
  if (!m) throw new Error(`Unexpected color-mix output: ${css}`);
  return { pct: Number(m[2]) / 100, token: m[3] };
}

describe('course pill contrast', () => {
  it('every palette color clears WCAG AA on its own pill, in every theme', () => {
    const failures: string[] = [];

    for (const { name, ink, inset } of THEMES) {
      for (const { name: colorName, value } of COURSE_COLORS) {
        const inkMix  = parseMix(courseInk(value));
        const bgMix   = parseMix(coursePillBg(value));

        expect(inkMix.token).toBe('--ink');
        expect(bgMix.token).toBe('--inset');

        const text = colorMix(value, inkMix.pct, ink);
        const bg   = colorMix(value, bgMix.pct, inset);
        const ratio = contrastRatio(text, bg);

        if (ratio < 4.5) {
          failures.push(`${colorName} (${value}) on ${name}: ${ratio.toFixed(2)}:1`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps enough of the course hue to still read as that course', () => {
    // The ink is a mix, not a flat gray: it must not collapse to the ink token.
    // 35% of the hue survives — enough that two courses never look alike.
    expect(courseInk('#e2a53b')).toContain('#e2a53b');
    expect(courseInk('#e2a53b')).toContain('35%');
  });
});

describe('contrastTextColor', () => {
  it('puts dark ink on pastels and white on saturated colors', () => {
    expect(contrastTextColor('#f5dfa0')).toBe('#1e1208'); // Pastel Amber
    expect(contrastTextColor('#c35656')).toBe('#ffffff'); // Red
  });

  it('falls back to white for a malformed color', () => {
    expect(contrastTextColor('nonsense')).toBe('#ffffff');
  });
});
