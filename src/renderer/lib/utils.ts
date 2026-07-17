import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge resolves conflicts between utilities ("px-2 px-4" → "px-4"), but it
// only knows Tailwind's *stock* class names. Our type ramp adds two sizes of its own
// through @theme in index.css (--text-caption, --text-display), and tailwind-merge
// can't tell `text-caption` from a colour like `text-muted`: both look like `text-*`.
// So it filed the custom size under text-colour, decided the two conflicted, and
// silently dropped whichever came first.
//
// That is not cosmetic. Every cn() call holding `text-caption` next to a text colour
// lost the size and fell back to the inherited 16px — which is why the study heatmap's
// "Mon / Wed / Fri" rendered nearly 3× their intended 11px and were clipped by their
// own gutter. Declaring the custom sizes here puts them in the font-size group, where
// they override other sizes and never fight a colour again.
//
// Anything added to the ramp in index.css must be added here too.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'display'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
