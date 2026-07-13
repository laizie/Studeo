// Fixed color palette for course accents.
// Used as left-bar stripes and abbreviation pills — never as full backgrounds.
// Add new colors here only; never hardcode hex values elsewhere.
export const COURSE_COLORS = [
  { name: 'Slate',        value: '#64748b' },
  { name: 'Pastel Slate', value: '#b8c8d8' },
  { name: 'Red',          value: '#c35656' },
  { name: 'Pastel Red',   value: '#f2b4b4' },
  { name: 'Orange',       value: '#cf854d' },
  { name: 'Pastel Orange',value: '#f5caa8' },
  { name: 'Brown',        value: '#7b5c46' },
  { name: 'Pastel Brown', value: '#d4baa8' },
  { name: 'Amber',        value: '#e2a53b' },
  { name: 'Pastel Amber', value: '#f5dfa0' },
  { name: 'Lime',         value: '#90bc4e' },
  { name: 'Pastel Lime',  value: '#cce896' },
  { name: 'Green',        value: '#32b562' },
  { name: 'Pastel Green', value: '#8de0b0' },
  { name: 'Teal',         value: '#5fd3c5' },
  { name: 'Pastel Teal',  value: '#a8ece8' },
  { name: 'Sky',          value: '#59abd1' },
  { name: 'Pastel Sky',   value: '#a8d8f0' },
  { name: 'Blue',         value: '#6393e1' },
  { name: 'Pastel Blue',  value: '#a8c4f2' },
  { name: 'Indigo',       value: '#6f70d5' },
  { name: 'Pastel Indigo',value: '#b8b8ef' },
  { name: 'Violet',       value: '#846bbf' },
  { name: 'Pastel Violet',value: '#c8b8e4' },
  { name: 'Pink',         value: '#cd6c9d' },
  { name: 'Pastel Pink',  value: '#f0b4d4' },
  { name: 'Rose',         value: '#e45b72' },
  { name: 'Pastel Rose',  value: '#f2aab8' },
] as const;

export type CourseColorValue = typeof COURSE_COLORS[number]['value'];

export const DEFAULT_COURSE_COLOR: CourseColorValue = '#6393e1';

/** Standalone-task violet (DESIGN.md §2 Secondary). The CSS token `--task`
 *  carries it in classes (bg-task); this constant is for JS style objects
 *  (calendar event chips). One value, two consumers. */
export const TASK_COLOR = '#7c6abf';

// ── The course pill recipe ────────────────────────────────────────────────────
// The abbreviation pill is the app's most common "which class?" cue, and it was
// unreadable: text was the raw course color on a 25%-alpha tint of *itself*
// (`${color}40`), which lands at ~1.2:1 for the 14 pastels (Pastel Amber as text
// is effectively invisible) and misses 4.5:1 for most mid colors too.
//
// The fix keeps the same look — a tinted chip carrying the course's hue — but
// composites it against the theme's own tokens instead of raw alpha:
//
//   background = 25% course color into `--inset` (the well: cream on light,
//                dark brown on dark/warm — so the chip never washes out)
//   text       = 35% course color into `--ink`   (dark on light, cream on dark)
//
// Because both sides reference tokens that already flip per theme, one recipe
// covers light/dark/warm. Every one of the 28 palette colors clears WCAG AA
// (worst case 4.64:1) in all three — locked by colors.test.ts.
const PILL_TINT = '25%';
const INK_MIX   = '35%';

/** Readable ink for a course color used as text (pill label, course-tinted %). */
export function courseInk(color: string): string {
  return `color-mix(in srgb, ${color} ${INK_MIX}, var(--ink))`;
}

/** The pill's tinted background — the course hue laid into the theme's well. */
export function coursePillBg(color: string): string {
  return `color-mix(in srgb, ${color} ${PILL_TINT}, var(--inset))`;
}

/**
 * Pick a readable text color for content rendered ON a course color
 * (calendar event chips, filled badges). Pastel colors need dark ink;
 * saturated colors need white. Uses WCAG relative luminance.
 */
export function contrastTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(i => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#1e1208' : '#ffffff';
}
