// Pure helpers for the "New semester" setup wizard (renderer/features/setup).
// No Electron/Node imports — just data shaping the UI leans on, kept here so it
// stays unit-testable (CLAUDE.md: business logic lives in shared/).

import type { CreateClassMeetingInput } from './types';

/**
 * Suggest a term name for the wizard's first field, biased toward the term a
 * student is most likely *setting up for* right now (setup happens before a
 * term starts, not during it):
 *   Jul–Oct → the coming Fall
 *   Nov–Dec → next year's Spring
 *   Jan–Mar → this Spring
 *   Apr–Jun → this Summer
 * It's only a prefill — the user can overwrite it.
 */
export function suggestTermName(now: Date = new Date()): string {
  const month = now.getMonth(); // 0 = January … 11 = December
  const year = now.getFullYear();
  if (month >= 6 && month <= 9) return `Fall ${year}`;      // Jul–Oct
  if (month >= 10) return `Spring ${year + 1}`;             // Nov–Dec → next spring
  if (month <= 2) return `Spring ${year}`;                  // Jan–Mar
  return `Summer ${year}`;                                  // Apr–Jun
}

/**
 * Whether a class-time range is sane. Times are "HH:MM" 24-hour strings from
 * <input type="time">, which zero-pad, so a plain string compare orders them.
 */
export function timeRangeValid(startTime: string, endTime: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return false;
  return startTime < endTime;
}

/**
 * Expand a "same time on several weekdays" selection (the common MWF 9–10
 * pattern) into one CreateClassMeetingInput per day. Days are de-duplicated and
 * sorted Sunday-first so the created meetings read in weekday order.
 */
export function expandWeekdayMeetings(
  courseId: string,
  days: number[],
  startTime: string,
  endTime: string,
): CreateClassMeetingInput[] {
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  return unique.map(dayOfWeek => ({ courseId, dayOfWeek, startTime, endTime }));
}
