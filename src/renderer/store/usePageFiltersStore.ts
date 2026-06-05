import { create } from 'zustand';

export type ThisWeekWindow  = 'this_week' | 'two_weeks' | 'month';
export type TasksDueFilter  = 'week' | 'month' | 'all';
export type CalendarMode    = 'assignments' | 'lectures';
export type CalendarView    = 'month' | 'week' | 'day' | 'agenda';

interface PageFiltersState {
  // This Week page
  thisWeekWindow:       ThisWeekWindow;
  setThisWeekWindow:    (w: ThisWeekWindow) => void;
  thisWeekShowTasks:    boolean;
  setThisWeekShowTasks: (v: boolean) => void;

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

  // Semester filter (null = all terms)
  termFilter:           string | null;
  setTermFilter:        (id: string | null) => void;
}

export const usePageFiltersStore = create<PageFiltersState>()((set) => ({
  thisWeekWindow:        'this_week',
  setThisWeekWindow:     (thisWeekWindow)      => set({ thisWeekWindow }),
  thisWeekShowTasks:     false,
  setThisWeekShowTasks:  (thisWeekShowTasks)   => set({ thisWeekShowTasks }),

  tasksDueFilter:        'all',
  setTasksDueFilter:     (tasksDueFilter)      => set({ tasksDueFilter }),
  tasksShowCompleted:    false,
  setTasksShowCompleted: (tasksShowCompleted)  => set({ tasksShowCompleted }),

  calendarMode:          'assignments',
  setCalendarMode:       (calendarMode)        => set({ calendarMode }),
  calendarView:          'month',
  setCalendarView:       (calendarView)        => set({ calendarView }),
  calendarShowTasks:     false,
  setCalendarShowTasks:  (calendarShowTasks)   => set({ calendarShowTasks }),

  termFilter:            null,
  setTermFilter:         (termFilter)          => set({ termFilter }),
}));
