import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSyncScheduler } from '../syncScheduler';

// Fake timers throughout: this module is nothing but timing, and the whole
// point of extracting it was to be able to test that without a Reminders.app
// at five seconds a round-trip.

const QUIET = 10_000;
const MAX_WAIT = 60_000;

function setup(busy = () => false) {
  const run = vi.fn();
  const scheduler = createSyncScheduler(run, { quietMs: QUIET, maxWaitMs: MAX_WAIT, isBusy: busy });
  return { run, scheduler };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSyncScheduler', () => {
  it('waits out the quiet period before syncing', () => {
    const { run, scheduler } = setup();
    scheduler.request();

    vi.advanceTimersByTime(QUIET - 1);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst of changes into one pass', () => {
    // Day-One Setup: a semester entered a row at a time. Each row must not arm
    // its own pass against an app whose round-trips take seconds.
    const { run, scheduler } = setup();
    for (let i = 0; i < 30; i++) {
      scheduler.request();
      vi.advanceTimersByTime(500);
    }
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(QUIET);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stops deferring once the ceiling is reached', () => {
    // A steady stream of edits slower than the quiet period would otherwise
    // push the pass back forever — the exact starvation the debounce exists to
    // avoid, reintroduced by the debounce itself.
    const { run, scheduler } = setup();
    for (let elapsed = 0; elapsed <= MAX_WAIT + QUIET * 2; elapsed += QUIET / 2) {
      scheduler.request();
      vi.advanceTimersByTime(QUIET / 2);
    }
    expect(run).toHaveBeenCalled();
  });

  it('runs again for changes made after a pass', () => {
    const { run, scheduler } = setup();
    scheduler.request();
    vi.advanceTimersByTime(QUIET);
    expect(run).toHaveBeenCalledTimes(1);

    scheduler.request();
    vi.advanceTimersByTime(QUIET);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('waits for an in-flight pass instead of being swallowed by it', () => {
    // The sync's own guard drops an overlapping call. Firing into that would
    // lose the change until the five-minute poll, which is what this exists to
    // improve on.
    let busy = true;
    const { run, scheduler } = setup(() => busy);

    scheduler.request();
    vi.advanceTimersByTime(QUIET);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(QUIET * 3);
    expect(run).not.toHaveBeenCalled();

    busy = false;
    vi.advanceTimersByTime(QUIET);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a pending pass', () => {
    const { run, scheduler } = setup();
    scheduler.request();
    expect(scheduler.pending()).toBe(true);

    scheduler.cancel();
    vi.advanceTimersByTime(QUIET * 5);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(false);
  });

  it('does nothing on its own', () => {
    const { run } = setup();
    vi.advanceTimersByTime(MAX_WAIT * 2);
    expect(run).not.toHaveBeenCalled();
  });
});
