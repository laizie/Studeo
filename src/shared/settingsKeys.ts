/**
 * Every preference key the renderer is allowed to persist.
 *
 * This list is the security boundary for `app:setSetting`: IPC input is untrusted, so
 * main refuses to write a key that isn't here. It lives in `shared/` because both sides
 * need the same answer and they were previously kept in sync by a comment — which is how
 * 'canvasFeedUrl' ended up written by the renderer and silently dropped by main, so the
 * Import page's feed URL was never actually remembered and nothing said so.
 *
 * Now the renderer's write helpers are typed against `SettingKey`, so a key that main
 * would reject doesn't compile. Adding a preference = adding one line here.
 */
export const SETTING_KEYS = [
  'theme',
  'musicMode',
  'defaultMusicService',
  'classRemindersEnabled',
  'reminderLeadMinutes',
  'dueDigestEnabled',
  'dueDigestTime',
  'timerSound',
  'reflectionPrompt',
  'ambienceVolume',

  // Pomodoro timer configuration.
  'focusMins',
  'breakMins',
  'longBreakMins',
  'customTechnique',
  /** Whether the timer rolls straight into the next phase (Study page / Focus Mode). */
  'autoAdvance',

  /** Last .ics feed URL used on the Import page, so a re-import is one click. */
  'canvasFeedUrl',

  // Page view preferences — the filters and switches on This Week, Tasks, the
  // Calendar and the sidebar. All written by the renderer's usePageFiltersStore.
  'thisWeekWindow',
  'thisWeekShowTasks',
  'thisWeekShowCompleted',
  'tasksDueFilter',
  'tasksShowCompleted',
  'calendarMode',
  'calendarView',
  'calendarShowTasks',
  'calendarShowStudyBlocks',
  'notesNavOpen',
  'termFilter',
  'termFilterInitialized',
] as const;

export type SettingKey = typeof SETTING_KEYS[number];
