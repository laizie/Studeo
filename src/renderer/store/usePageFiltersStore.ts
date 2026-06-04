import { create } from 'zustand';

export type ThisWeekWindow  = 'this_week' | 'two_weeks' | 'month';
export type TasksDueFilter  = 'week' | 'month' | 'all';
export type CalendarMode    = 'assignments' | 'lectures';
export type CalendarView    = 'month' | 'week' | 'day' | 'agenda';

interface PageFiltersState {
  // This Week page
  thisWeekWindow:       ThisWeekWindow;
  setThisWeekWindow:    (w: ThisWeekWindow) => void;

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
}

export const usePageFiltersStore = create<PageFiltersState>()((set) => ({
  thisWeekWindow:        'this_week',
  setThisWeekWindow:     (thisWeekWindow)      => set({ thisWeekWindow }),

  tasksDueFilter:        'all',
  setTasksDueFilter:     (tasksDueFilter)      => set({ tasksDueFilter }),
  tasksShowCompleted:    false,
  setTasksShowCompleted: (tasksShowCompleted)  => set({ tasksShowCompleted }),

  calendarMode:          'assignments',
  setCalendarMode:       (calendarMode)        => set({ calendarMode }),
  calendarView:          'month',
  setCalendarView:       (calendarView)        => set({ calendarView }),
}));
