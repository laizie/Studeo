import { describe, it, expect } from 'vitest';
import { shouldAbortPass } from '../index';

// The sync ran one osascript process per item, awaited one at a time, each able
// to burn the full 20s script timeout — with nothing watching the pass as a
// whole. A plan whose calls were all failing slowly cost 20s × every item, so
// the Settings row sat on "Syncing…" long enough to be reported as a hang.
// These lock the two ways a pass is now allowed to give up.

describe('shouldAbortPass', () => {
  it('keeps going while calls are succeeding', () => {
    expect(shouldAbortPass(0, 0)).toBeNull();
    expect(shouldAbortPass(0, 60_000)).toBeNull();
  });

  it('tolerates isolated failures among successes', () => {
    // A single failure is the self-healing path — a reminder deleted on the
    // phone — and must not stop a pass that is otherwise working. The counter
    // is consecutive for exactly this reason.
    expect(shouldAbortPass(1, 0)).toBeNull();
    expect(shouldAbortPass(2, 0)).toBeNull();
  });

  it('stops on a run of failures, because the next call will fail too', () => {
    expect(shouldAbortPass(3, 0)).toBe('failures');
    expect(shouldAbortPass(9, 0)).toBe('failures');
  });

  it('stops a pass that has outstayed its budget even while succeeding', () => {
    // The slow-but-working case: a first-ever sync of a whole semester. Better
    // to do part of the work every few minutes than to look wedged, and the
    // pass is resumable — links are written as each item lands.
    expect(shouldAbortPass(0, 90_000)).toBe('budget');
    expect(shouldAbortPass(0, 89_999)).toBeNull();
  });

  it('reports failures before budget when both trip at once', () => {
    // Failures name a cause the user can act on; "slow" does not.
    expect(shouldAbortPass(3, 120_000)).toBe('failures');
  });
});
