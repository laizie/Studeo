import { describe, it, expect } from 'vitest';
import { SETTING_KEYS } from '../../../shared/settingsKeys';

// The setting allowlist is a boundary that fails QUIETLY when it's wrong: main refuses a
// key it doesn't recognise, the renderer's write resolves anyway, and the preference just
// never comes back after a relaunch. That's how 'canvasFeedUrl' stayed broken. These
// tests guard the two ways the list itself can rot.

describe('setting keys allowlist', () => {
  it('has no duplicates', () => {
    expect(new Set(SETTING_KEYS).size).toBe(SETTING_KEYS.length);
  });

  it('covers every preference the renderer persists', () => {
    // The renderer writes these through lib/prefs, which is typed against SettingKey —
    // so this list is really asserting that the typed door is the ONLY door. If someone
    // adds a preference by calling window.api.app.setSetting directly with a key that
    // isn't here, main drops it and the toggle silently forgets itself.
    const expected = [
      // Appearance + notifications
      'theme', 'musicMode', 'defaultMusicService',
      'classRemindersEnabled', 'reminderLeadMinutes', 'dueDigestEnabled', 'dueDigestTime',
      'timerSound', 'reflectionPrompt', 'ambienceVolume',
      // Pomodoro
      'focusMins', 'breakMins', 'longBreakMins', 'customTechnique', 'autoAdvance',
      // Import
      'canvasFeedUrl',
      // Page view preferences (usePageFiltersStore)
      'thisWeekWindow', 'thisWeekShowTasks', 'thisWeekShowCompleted',
      'tasksDueFilter', 'tasksShowCompleted',
      'calendarMode', 'calendarView', 'calendarShowTasks', 'calendarShowStudyBlocks',
      'notesNavOpen', 'termFilter', 'termFilterInitialized',
    ];
    expect([...SETTING_KEYS].sort()).toEqual(expected.sort());
  });
});
