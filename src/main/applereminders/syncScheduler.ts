/**
 * Coalesces "something changed" into "sync soon, once".
 *
 * The mirror used to move only on a five-minute poll, so an assignment you
 * added could take that long to reach the phone. Syncing on every change
 * instead is the obvious fix and the wrong one: Day-One Setup enters a whole
 * semester a row at a time, and each row would arm its own pass against an app
 * whose round-trips are measured in seconds.
 *
 * So: a trailing debounce with a ceiling. Changes push the pass back until
 * they stop for `quietMs`, but never past `maxWaitMs` after the first one —
 * otherwise a long steady stream of edits (an import, or someone working
 * through a checklist) defers the sync indefinitely, which is the failure the
 * debounce was supposed to prevent.
 *
 * Timers only; no Reminders, no DB, no Electron — so the timing is testable.
 */
export interface SyncScheduler {
  /** Something changed. Sync soon, coalescing with any other recent change. */
  request(): void;
  /** Drop any pending pass (the mirror was switched off, or the app is quitting). */
  cancel(): void;
  /** Is a pass currently waiting to fire? Exposed for tests and diagnostics. */
  pending(): boolean;
}

export interface SyncSchedulerOptions {
  /** Quiet period after the last change before the pass runs. */
  quietMs: number;
  /** Longest a pass may be deferred after the first change in a burst. */
  maxWaitMs: number;
  /** True while a pass is already running; the scheduler waits it out. */
  isBusy: () => boolean;
}

export function createSyncScheduler(
  run: () => void,
  { quietMs, maxWaitMs, isBusy }: SyncSchedulerOptions,
): SyncScheduler {
  let quietTimer: NodeJS.Timeout | null = null;
  let firstRequestAt: number | null = null;

  function clear(): void {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
    firstRequestAt = null;
  }

  function fire(): void {
    // A pass is already in flight. Running now would be dropped by the sync's
    // own in-flight guard and the change would wait for the five-minute poll
    // after all, so wait for the current pass to finish instead. The ceiling
    // deliberately does NOT apply here: this is not a deferral caused by more
    // edits arriving, and there is nothing to gain by giving up.
    if (isBusy()) {
      quietTimer = setTimeout(fire, quietMs);
      return;
    }
    clear();
    run();
  }

  return {
    request() {
      const now = Date.now();
      if (firstRequestAt === null) firstRequestAt = now;

      // Past the ceiling: stop pushing the pass back and let the pending timer
      // run out on its own.
      if (now - firstRequestAt >= maxWaitMs) return;

      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(fire, quietMs);
    },

    cancel: clear,

    pending: () => quietTimer !== null,
  };
}
