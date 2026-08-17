import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Every theme's tokens, checked against the two questions a color theme can fail:
//
//   1. Can you READ it?   — text/background pairs must clear WCAG contrast.
//   2. Can you SEE it?    — a card must look lifted off the page, a hairline must
//                           look like a line, a hover must look like a hover. Two
//                           tokens that resolve to nearly the same color are a
//                           silently broken UI, not a subtle one.
//
// The values are parsed out of src/index.css rather than copied here, so this is
// a guardrail on the real stylesheet: retuning a token or adding a fifth theme
// is checked automatically, and there is no second copy to drift.

const CSS = readFileSync(
  fileURLToPath(new URL('../../../index.css', import.meta.url)),
  'utf8',
);

type Tokens = Record<string, string>;

/**
 * Pull the `--name: #hex;` declarations out of one CSS block.
 * `nth` disambiguates a repeated selector — index.css has two plain `:root`
 * blocks, the light tokens and the shared sidebar/task chrome.
 */
function block(selector: string, nth = 1): Tokens {
  let start = -1;
  for (let i = 0; i < nth; i++) {
    start = CSS.indexOf(`\n${selector} {`, start + 1);
    if (start === -1) throw new Error(`index.css has fewer than ${nth} \`${selector}\` blocks`);
  }
  // No token block nests braces, so the first closing brace at column 0 ends it.
  const body = CSS.slice(start, CSS.indexOf('\n}', start));

  const tokens: Tokens = {};
  for (const m of body.matchAll(/^\s*(--[a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gim)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

const LIGHT  = block(':root');      // the light theme's own tokens
const CHROME = block(':root', 2);   // sidebar/task defaults every theme inherits

// Each theme is the cascade it actually gets in the browser: the :root baseline,
// then every block that applies to it. `warm` inherits the creams from `.dark`
// because applyTheme puts BOTH on <html>; `blush` is light-family, so it doesn't.
const THEMES: { name: string; tokens: Tokens }[] = [
  { name: 'light', tokens: { ...CHROME, ...LIGHT } },
  { name: 'dark',  tokens: { ...CHROME, ...LIGHT, ...block('.dark') } },
  { name: 'warm',  tokens: { ...CHROME, ...LIGHT, ...block('.dark'), ...block('html[data-theme="warm"]') } },
  { name: 'blush', tokens: { ...CHROME, ...LIGHT, ...block('html[data-theme="blush"]') } },
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

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * CIE L*a*b* (D65), for the one question contrast ratio can't answer: "do these
 * two colors LOOK different?" Contrast only measures lightness, so it calls the
 * light theme's cream and blush's pale pink near-identical (1.03) when the eye
 * reads them as two obviously different colors — the difference is hue, and hue
 * is exactly what a theme's identity is made of.
 */
function toLab([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(channel);
  // Linear sRGB → CIE XYZ, then normalised against the D65 white point.
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / 1.0;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE*ab. Roughly: 2.3 is the just-noticeable difference, 5 is unmistakable. */
function deltaE(a: string, b: string): number {
  const [la, aa, ba] = toLab(hexToRgb(a));
  const [lb, ab, bb] = toLab(hexToRgb(b));
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

describe('theme tokens', () => {
  it('defines every role in every theme', () => {
    const ROLES = [
      '--bg', '--surface', '--surface-hi', '--inset', '--line', '--line-strong',
      '--ink', '--ink-soft', '--muted', '--accent', '--accent-deep', '--accent-ink',
      '--paper', '--sidebar', '--sidebar-line', '--sidebar-hover', '--sidebar-muted',
      '--sidebar-ink',
    ];
    for (const { name, tokens } of THEMES) {
      for (const role of ROLES) {
        expect(tokens[role], `${name} is missing ${role}`).toBeDefined();
      }
    }
  });

  it('keeps text readable on every surface it can land on', () => {
    // WCAG AA: 4.5:1 for body text, on every fill the text can actually land on.
    // (The bar is AA rather than AAA because warm's mid-brown surfaces are a
    // committed design choice that tops out around 4.8:1 for --ink; light, dark
    // and blush all clear AAA on their cards with room to spare.)
    const PAIRS: [fg: string, bg: string, min: number][] = [
      ['--ink',       '--bg',       4.5],
      ['--ink',       '--surface',  4.5],
      ['--ink',       '--surface-hi', 4.5],
      ['--ink',       '--inset',    4.5],
      ['--ink',       '--paper',    4.5],
      ['--ink-soft',  '--surface',  4.5],
      ['--ink-soft',  '--bg',       4.5],
      // Meta text is the smallest type in the app and lands on all four fills.
      ['--muted',     '--surface',  4.5],
      ['--muted',     '--bg',       4.5],
      ['--muted',     '--inset',    4.5],
      ['--muted',     '--surface-hi', 4.5],
      // Label on a filled accent button — resting and hovered.
      ['--accent-ink', '--accent',      4.5],
      ['--accent-ink', '--accent-deep', 4.5],
      // The sidebar is its own room: it keeps its own ink/muted against its own fill.
      ['--sidebar-ink',   '--sidebar', 4.5],
      ['--sidebar-muted', '--sidebar', 4.5],
      // The active nav item is a filled accent chip sitting on the sidebar.
      ['--accent-ink',    '--accent',  4.5],
    ];

    const failures: string[] = [];
    for (const { name, tokens } of THEMES) {
      for (const [fg, bg, min] of PAIRS) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        if (ratio < min) {
          failures.push(`${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (needs ${min})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps adjacent surfaces telling themselves apart', () => {
    // The "awkwardly similar" check. These are not accessibility minimums —
    // they're the point where a difference stops being perceptible on a normal
    // screen. A hover you cannot see is the same bug as text you cannot read.
    const PAIRS: [a: string, b: string, min: number][] = [
      ['--bg',      '--surface',     1.05],  // a card looks lifted off the page
      ['--surface', '--surface-hi',  1.04],  // a hovered row looks hovered
      ['--bg',      '--inset',       1.05],  // a well looks recessed
      ['--surface', '--line',        1.12],  // a hairline on a card is a line
      ['--bg',      '--line',        1.08],  // …and still a line on the page
      ['--line',    '--line-strong', 1.06],  // the hover border is a step, not a nudge
      ['--accent',  '--accent-deep', 1.06],  // a pressed button looks pressed
      ['--sidebar', '--sidebar-line',  1.10],
      ['--sidebar', '--sidebar-hover', 1.20],
    ];

    const failures: string[] = [];
    for (const { name, tokens } of THEMES) {
      for (const [a, b, min] of PAIRS) {
        const ratio = contrast(tokens[a], tokens[b]);
        if (ratio < min) {
          failures.push(`${name}: ${a} vs ${b} is ${ratio.toFixed(3)} (needs ${min})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('never repeats one color under two different role names', () => {
    // Two roles resolving to the same hex means one of them silently does
    // nothing — the theme has a role it cannot express. (--paper and --surface
    // are exempt: in the dark themes the note sheet IS the card surface, stated
    // deliberately rather than by accident.)
    const failures: string[] = [];
    for (const { name, tokens } of THEMES) {
      const roles = ['--bg', '--surface', '--surface-hi', '--inset', '--line', '--line-strong'];
      const seen = new Map<string, string>();
      for (const role of roles) {
        const hex = tokens[role].toLowerCase();
        const prior = seen.get(hex);
        if (prior) failures.push(`${name}: ${role} is the same color as ${prior} (${hex})`);
        seen.set(hex, role);
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives every theme its own identity, not a re-tint of another', () => {
    // Two themes whose page and accent colors both look the same are one theme
    // with two names in the picker. Well past the JND on at least one of them.
    const failures: string[] = [];
    for (let i = 0; i < THEMES.length; i++) {
      for (let j = i + 1; j < THEMES.length; j++) {
        const a = THEMES[i], b = THEMES[j];
        const page   = deltaE(a.tokens['--bg'], b.tokens['--bg']);
        const accent = deltaE(a.tokens['--accent'], b.tokens['--accent']);
        if (page < 5 && accent < 5) {
          failures.push(
            `${a.name} and ${b.name} are the same theme twice ` +
            `(page ΔE ${page.toFixed(1)}, accent ΔE ${accent.toFixed(1)})`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
