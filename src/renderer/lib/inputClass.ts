// The one input recipe (DESIGN.md §5 Inputs/Fields). Import it — don't
// re-spell the Tailwind string: six drifted copies is how the app ended up
// with four different input-background spellings.
export const INPUT_CLASS =
  'w-full px-3 py-2 text-sm text-ink bg-surface border border-stone-300 rounded-lg ' +
  'placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'dark:bg-inset dark:border-line dark:focus:ring-muted';
