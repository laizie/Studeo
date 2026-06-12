// Pure exception-lookup logic shared by the calendar (renderer) and the
// reminder scheduler (main) — no Electron/Node imports.

import type { ClassMeeting, MeetingException } from './types';

export type ExceptionIndex = Map<string, MeetingException>;

function key(meetingId: string, date: string): string {
  return `${meetingId}:${date}`;
}

/** Index exceptions for O(1) lookup by meeting + date. */
export function buildExceptionIndex(exceptions: MeetingException[]): ExceptionIndex {
  return new Map(exceptions.map(e => [key(e.meeting_id, e.date), e]));
}

export interface ResolvedOccurrence {
  cancelled: boolean;
  startTime: string;
  endTime: string;
  location: string | null;
  /** True when a 'moved' exception changed time or location for this date. */
  moved: boolean;
}

/**
 * What actually happens for `meeting` on `date` (YYYY-MM-DD), after applying
 * any exception: the regular slot, a moved slot, or nothing (cancelled).
 */
export function resolveOccurrence(
  meeting: ClassMeeting,
  date: string,
  index: ExceptionIndex,
): ResolvedOccurrence {
  const ex = index.get(key(meeting.id, date));

  if (ex?.kind === 'cancelled') {
    return {
      cancelled: true,
      startTime: meeting.start_time,
      endTime: meeting.end_time,
      location: meeting.location,
      moved: false,
    };
  }

  if (ex?.kind === 'moved') {
    return {
      cancelled: false,
      startTime: ex.new_start_time ?? meeting.start_time,
      endTime: ex.new_end_time ?? meeting.end_time,
      location: ex.new_location ?? meeting.location,
      moved: true,
    };
  }

  return {
    cancelled: false,
    startTime: meeting.start_time,
    endTime: meeting.end_time,
    location: meeting.location,
    moved: false,
  };
}
