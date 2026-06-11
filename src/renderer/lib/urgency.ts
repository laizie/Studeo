// Single source of truth for deadline-urgency badge styling.
// Keys match the `urgency` values produced by shared/deadlines.ts.
// All text/tint pairs meet WCAG AA (≥4.5:1) at badge size in both light and
// dark themes — change values here only, never copy this map into a component.
export const URGENCY_CLASS: Record<string, string> = {
  overdue:  'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/70',
  today:    'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/70',
  tomorrow: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-950/70',
  soon:     'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/70',
  week:     'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-950/70',
  later:    'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-950/70',
  future:   'text-green-800 bg-green-100 dark:text-green-300 dark:bg-green-950/70',
};
