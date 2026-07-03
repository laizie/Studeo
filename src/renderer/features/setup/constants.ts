// Shared bits for the semester setup wizard steps.

// Matches the input styling used across the app's dialogs (CourseDialog etc.)
// so the wizard feels native rather than bolted on.
export const WIZARD_INPUT =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'placeholder:text-stone-500 ' +
  'dark:bg-inset dark:border-line dark:text-ink dark:placeholder:text-muted dark:focus:ring-muted';

// Short weekday labels, indexed by day_of_week (0 = Sunday). Two-letter so the
// two T-days and two S-days stay distinguishable in the toggle row.
export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

// Three-letter weekday names for reading back a saved meeting ("Mon 9:00 AM").
export const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
