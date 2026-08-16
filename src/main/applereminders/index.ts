import { listAssignments } from '../db/repositories/assignmentRepo';
import { listCourses } from '../db/repositories/courseRepo';
import {
  listReminderLinks,
  saveReminderLink,
  deleteReminderLink,
} from '../db/repositories/appleReminderLinkRepo';
import { planReminderSync } from '../../shared/appleReminderSync';
import type { AppleRemindersStatus } from '../../shared/types';
import { getSetting, setSetting } from '../settings';
import {
  ensureList,
  createReminder,
  updateReminder,
  completeReminder,
  deleteReminder,
} from './remindersScript';

/**
 * Mirrors upcoming assignments into Apple Reminders so they reach the phone.
 *
 * The problem this solves: everything else that notifies you in Studeo runs on a
 * poll inside this process, so it all stops the moment the lid closes. Handing
 * the items to Reminders moves the alarm onto a device that's always awake, and
 * gives you something you can open and read rather than a notification you
 * dismissed on the way to class.
 *
 * The decision-making lives in shared/appleReminderSync.ts and is unit-tested.
 * This module is the plumbing around it: settings, a timer, and turning a plan
 * into AppleScript calls.
 */

/**
 * A dedicated list, not one the user picks.
 *
 * This is a safety property rather than a shortcut: the sync deletes and
 * completes items in whatever list it owns. Pointed at an existing list it would
 * be capable of ticking off (or removing) reminders it didn't create. Owning a
 * list called "Studeo" means the worst it can do is mismanage its own mirror.
 */
const LIST_NAME = 'Studeo';

const SETTING_KEY = 'appleRemindersEnabled';

/** Assignments change at human speed; five minutes is well inside "before I
 *  notice". A sync with nothing to do costs zero AppleScript calls (see below),
 *  so the idle case is just a SQLite read. */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

let interval: NodeJS.Timeout | null = null;
let syncing = false;
let lastSyncAt: string | null = null;
let lastError: string | null = null;
/** The list only has to be checked once per run, and only when there's work. */
let listVerified = false;

function supported(): boolean {
  return process.platform === 'darwin';
}

function isEnabled(): boolean {
  return getSetting(SETTING_KEY) === 'true';
}

export function getAppleRemindersStatus(): AppleRemindersStatus {
  return {
    supported: supported(),
    enabled: supported() && isEnabled(),
    syncing,
    lastSyncAt,
    lastError,
    mirrored: supported() ? listReminderLinks().length : 0,
    listName: LIST_NAME,
  };
}

/**
 * Run one sync pass.
 *
 * Ordering is deliberate: removals and completions first, creations last. If the
 * run dies partway (permission revoked, Reminders wedged), the list is left
 * having shed stale items rather than having gained duplicates — the failure
 * that's easy to live with rather than the one that needs manual cleanup.
 */
export async function syncAppleReminders(): Promise<AppleRemindersStatus> {
  if (!supported() || !isEnabled()) return getAppleRemindersStatus();
  // A slow AppleScript pass can outlast the interval; overlapping runs would
  // plan against the same links twice and create duplicates.
  if (syncing) return getAppleRemindersStatus();

  syncing = true;
  try {
    await runSyncPass();
  } catch (err) {
    lastError = describeFailure(err instanceof Error ? err.message : String(err));
  } finally {
    syncing = false;
  }
  // Built after the flag is cleared, so a finished sync doesn't report itself as
  // still running — the Settings row reads this to decide between "Syncing…" and
  // the real result, and would otherwise sit on the pending copy forever.
  return getAppleRemindersStatus();
}

/**
 * One pass. Records its outcome in lastSyncAt / lastError and returns nothing —
 * the caller owns the in-flight flag and builds the status once, after clearing it.
 */
async function runSyncPass(): Promise<void> {
  const plan = planReminderSync(listAssignments(), listCourses(), listReminderLinks(), new Date());
  const empty =
    plan.create.length === 0 && plan.update.length === 0 &&
    plan.complete.length === 0 && plan.remove.length === 0;

  // Nothing to do: return without touching AppleScript at all. This is what
  // keeps a five-minute interval from launching Reminders.app all day.
  if (empty && listVerified) {
    lastSyncAt = new Date().toISOString();
    lastError = null;
    return;
  }

  const listReady = await ensureList(LIST_NAME);
  if (!listReady.ok) {
    // Almost always Automation permission. Stop here rather than fail once per
    // item — one clear message beats twenty identical ones.
    lastError = describeFailure(listReady.value);
    return;
  }
  listVerified = true;

  let firstFailure: string | null = null;
  const noteFailure = (reason: string) => {
    if (!firstFailure) firstFailure = describeFailure(reason);
  };

  for (const { assignmentId, reminderId } of plan.remove) {
    const result = await deleteReminder(LIST_NAME, reminderId);
    // Gone from Reminders already is the outcome we wanted, so drop the link
    // either way — leaving it would retry this delete forever.
    deleteReminderLink(assignmentId);
    if (!result.ok) noteFailure(result.value);
  }

  for (const { assignmentId, reminderId } of plan.complete) {
    const result = await completeReminder(LIST_NAME, reminderId);
    if (result.ok) {
      // Keep the link: the assignment still exists, and if it's un-completed
      // later the next sync updates this same reminder instead of adding one.
      continue;
    }
    // Couldn't tick it off — most likely deleted on the phone. Forget it.
    deleteReminderLink(assignmentId);
    noteFailure(result.value);
  }

  for (const { reminderId, reminder } of plan.update) {
    const result = await updateReminder(LIST_NAME, reminderId, reminder);
    if (result.ok) {
      saveReminderLink(reminder.assignmentId, reminderId, reminder.signature);
    } else {
      // The reminder we recorded is unreachable. Dropping the link makes the
      // next pass recreate it, which is how a delete-on-phone self-heals.
      deleteReminderLink(reminder.assignmentId);
      noteFailure(result.value);
    }
  }

  for (const reminder of plan.create) {
    const result = await createReminder(LIST_NAME, reminder);
    if (result.ok && result.value) {
      saveReminderLink(reminder.assignmentId, result.value, reminder.signature);
    } else {
      noteFailure(result.value || 'Reminders did not return an id');
    }
  }

  lastSyncAt = new Date().toISOString();
  lastError = firstFailure;
}

/**
 * Turn raw osascript noise into something a person can act on.
 *
 * The permission case is worth naming explicitly: macOS reports it as error
 * -1743, which tells the user nothing, and the fix is three levels deep in
 * System Settings.
 */
function describeFailure(raw: string): string {
  if (/-1743|not authorized|not allowed/i.test(raw)) {
    return 'macOS blocked access to Reminders. Allow Studeo → Reminders in System Settings → Privacy & Security → Automation, then sync again.';
  }
  if (/-1728|Can’t get|Can't get/i.test(raw)) {
    return 'A reminder Studeo created is missing — it will be recreated on the next sync.';
  }
  if (/timed out|ETIMEDOUT/i.test(raw)) {
    return 'Reminders stopped responding. Try again in a moment.';
  }
  return raw.slice(0, 200);
}

/** Enable or disable the mirror, persisting the choice, and sync immediately on. */
export async function setAppleRemindersEnabled(enabled: boolean): Promise<AppleRemindersStatus> {
  setSetting(SETTING_KEY, enabled ? 'true' : 'false');
  lastError = null;

  if (enabled) {
    // Arm the interval WITHOUT its own kick-off pass, then await ours. Doing both
    // meant the fire-and-forget pass claimed the in-flight guard and this call
    // returned an untouched status — leaving the Settings row reading "Syncing…"
    // with nothing ever arriving to correct it.
    armInterval();
    return syncAppleReminders();
  }

  stopAppleRemindersSync();
  // Links are deliberately kept. Existing reminders stay in the list (deleting a
  // pile of the user's reminders on a toggle would be a rude surprise), and
  // keeping the mapping means switching back on updates them instead of creating
  // a second copy of everything.
  return getAppleRemindersStatus();
}

/** Start the recurring pass. Separate from the kick-off so a caller that intends to
 *  await its own sync doesn't race a fire-and-forget one for the in-flight guard. */
function armInterval(): void {
  if (interval) return;
  interval = setInterval(() => { void syncAppleReminders(); }, SYNC_INTERVAL_MS);
}

/** Called at app launch: catch up on whatever changed while Studeo was closed,
 *  then settle into the interval. Nothing awaits this, so it stays fire-and-forget. */
export function startAppleRemindersSync(): void {
  if (!supported() || !isEnabled()) return;
  armInterval();
  void syncAppleReminders();
}

export function stopAppleRemindersSync(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
