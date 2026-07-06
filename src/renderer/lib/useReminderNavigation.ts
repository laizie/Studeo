import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReminderNavTarget } from '../../shared/types';

/**
 * Deep-links from desktop reminders. When the user clicks a notification, main
 * pushes a {@link ReminderNavTarget} over IPC; this hook maps it to a route.
 *
 * Mounted once, app-wide, inside the router (Layout) — the same place the timer
 * driver lives — so a click routes the app no matter which screen is showing.
 * The `switch` is exhaustive: add a new target variant in shared/types.ts and
 * TypeScript flags this as needing a new case.
 */
export function useReminderNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const off = window.api.reminders.onNavigate((target: ReminderNavTarget) => {
      switch (target.view) {
        case 'course':
          navigate(`/courses/${target.courseId}`);
          break;
        case 'this-week':
          navigate('/this-week');
          break;
      }
    });
    return off; // unsubscribe on unmount
  }, [navigate]);
}
