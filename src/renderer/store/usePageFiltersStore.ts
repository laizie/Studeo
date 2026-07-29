import { create } from 'zustand';
import { readBoolPref, readEnumPref, readPref, writePref } from '../lib/prefs';

export type ThisWeekWindow  = 'this_week' | 'two_weeks' | 'month';
export type TasksDueFilter  = 'week' | 'month' | 'all';
export type CalendarMode    = 'assignments' | 'lectures';
export type CalendarView    = 'month' | 'week' | 'day' | 'agenda';

const THIS_WEEK_WINDOWS = ['this_week', 'two_weeks', 'month'] as const;
const TASKS_DUE_FILTERS = ['week', 'month', 'all'] as const;
const CALENDAR_MODES    = ['assignments', 'lectures'] as const;
const CALENDAR_VIEWS    = ['month', 'week', 'day', 'agenda'] as const;

interface PageFiltersState {
  // This Week page
  thisWeekWindow:       ThisWeekWindow;
  setThisWeekWindow:    (w: ThisWeekWindow) => void;
  thisWeekShowTasks:    boolean;
  setThisWeekShowTasks: (v: boolean) => void;
  thisWeekShowCompleted:    boolean;
  setThisWeekShowCompleted: (v: boolean) => void;

  // Tasks page
  tasksDueFilter:       TasksDueFilter;
  setTasksDueFilter:    (f: TasksDueFilter) => void;
  tasksShowCompleted:   boolean;
  setTasksShowCompleted:(v: boolean) => void;

  // Calendar page
  calendarMode:         CalendarMode;
  setCalendarMode:      (m: CalendarMode) => void;
  calendarView:         CalendarView;
  setCalendarView:      (v: CalendarView) => void;
  calendarShowTasks:    boolean;
  setCalendarShowTasks: (v: boolean) => void;
  calendarShowStudyBlocks:    boolean;
  setCalendarShowStudyBlocks: (v: boolean) => void;

  // Sidebar
  notesNavOpen:         boolean;
  setNotesNavOpen:      (v: boolean) => void;

  // Semester filter (null = all terms)
  termFilter:           string | null;
  setTermFilter:        (id: string | null) => void;
  /** True once the filter has a value — set by the user OR the one-time auto-select.
   *  Guards the auto-select so it can't override an explicit "All semesters" (null). */
  termFilterInitialized: boolean;
  /** One-time auto-select of the current term; a no-op after any choice was made. */
  initTermFilter:       (id: string | null) => void;
}

// Every value in this store is a deliberate choice the user made about how a page
// should look, so all of them survive a relaunch (see lib/prefs.ts for the why).
// The keys below are the on-disk names — renaming one silently resets that toggle,
// and every one of them must also appear in SETTING_KEYS in main/ipc/registerAppHandlers.ts
// (the allowlist is the security boundary; a key missing there is dropped on write).
const K = {
  thisWeekWindow:          'thisWeekWindow',
  thisWeekShowTasks:       'thisWeekShowTasks',
  thisWeekShowCompleted:   'thisWeekShowCompleted',
  tasksDueFilter:          'tasksDueFilter',
  tasksShowCompleted:      'tasksShowCompleted',
  calendarMode:            'calendarMode',
  calendarView:            'calendarView',
  calendarShowTasks:       'calendarShowTasks',
  calendarShowStudyBlocks: 'calendarShowStudyBlocks',
  notesNavOpen:            'notesNavOpen',
  termFilter:              'termFilter',
  termFilterInitialized:   'termFilterInitialized',
} as const;

// "" is how a null term filter ("All semesters") is stored — an explicit choice,
// distinct from the key being absent, which means "never chosen".
const storedTerm = readPref(K.termFilter);

export const usePageFiltersStore = create<PageFiltersState>()((set) => ({
  thisWeekWindow:        readEnumPref(K.thisWeekWindow, THIS_WEEK_WINDOWS, 'this_week'),
  setThisWeekWindow:     (thisWeekWindow) => {
    writePref(K.thisWeekWindow, thisWeekWindow);
    set({ thisWeekWindow });
  },
  thisWeekShowTasks:     readBoolPref(K.thisWeekShowTasks, false),
  setThisWeekShowTasks:  (thisWeekShowTasks) => {
    writePref(K.thisWeekShowTasks, String(thisWeekShowTasks));
    set({ thisWeekShowTasks });
  },
  thisWeekShowCompleted: readBoolPref(K.thisWeekShowCompleted, false),
  setThisWeekShowCompleted: (thisWeekShowCompleted) => {
    writePref(K.thisWeekShowCompleted, String(thisWeekShowCompleted));
    set({ thisWeekShowCompleted });
  },

  tasksDueFilter:        readEnumPref(K.tasksDueFilter, TASKS_DUE_FILTERS, 'all'),
  setTasksDueFilter:     (tasksDueFilter) => {
    writePref(K.tasksDueFilter, tasksDueFilter);
    set({ tasksDueFilter });
  },
  tasksShowCompleted:    readBoolPref(K.tasksShowCompleted, false),
  setTasksShowCompleted: (tasksShowCompleted) => {
    writePref(K.tasksShowCompleted, String(tasksShowCompleted));
    set({ tasksShowCompleted });
  },

  calendarMode:          readEnumPref(K.calendarMode, CALENDAR_MODES, 'assignments'),
  setCalendarMode:       (calendarMode) => {
    writePref(K.calendarMode, calendarMode);
    set({ calendarMode });
  },
  calendarView:          readEnumPref(K.calendarView, CALENDAR_VIEWS, 'month'),
  setCalendarView:       (calendarView) => {
    writePref(K.calendarView, calendarView);
    set({ calendarView });
  },
  calendarShowTasks:     readBoolPref(K.calendarShowTasks, false),
  setCalendarShowTasks:  (calendarShowTasks) => {
    writePref(K.calendarShowTasks, String(calendarShowTasks));
    set({ calendarShowTasks });
  },
  calendarShowStudyBlocks:    readBoolPref(K.calendarShowStudyBlocks, false),
  setCalendarShowStudyBlocks: (calendarShowStudyBlocks) => {
    writePref(K.calendarShowStudyBlocks, String(calendarShowStudyBlocks));
    set({ calendarShowStudyBlocks });
  },

  notesNavOpen:          readBoolPref(K.notesNavOpen, true),
  setNotesNavOpen:       (notesNavOpen) => {
    writePref(K.notesNavOpen, String(notesNavOpen));
    set({ notesNavOpen });
  },

  termFilter:            storedTerm === null || storedTerm === '' ? null : storedTerm,
  setTermFilter:         (termFilter) => {
    writePref(K.termFilter, termFilter ?? '');
    writePref(K.termFilterInitialized, 'true');
    set({ termFilter, termFilterInitialized: true });
  },
  termFilterInitialized: readBoolPref(K.termFilterInitialized, false),
  initTermFilter:        (id) =>
    set((s) => {
      if (s.termFilterInitialized) return s;
      writePref(K.termFilter, id ?? '');
      writePref(K.termFilterInitialized, 'true');
      return { termFilter: id, termFilterInitialized: true };
    }),
}));
