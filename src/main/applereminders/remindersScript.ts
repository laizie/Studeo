import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PlannedReminder, ReminderDueParts } from '../../shared/appleReminderSync';

/**
 * The Apple Reminders half of the phone-notification feature: create, update,
 * complete, and delete reminders in one dedicated list via AppleScript.
 *
 * Why Reminders rather than a push service: an item sitting in Reminders is
 * carried to the phone by iCloud, and from then on *the phone* owns the alert.
 * It fires with the laptop shut and off the network, and it can be opened and
 * read — neither of which a push from this process can do, because this process
 * isn't running when the lid is closed.
 *
 * Every value crosses into AppleScript through `argv`, never string
 * interpolation. Assignment names contain apostrophes and quotes routinely, and
 * splicing them into script source would break the script (at best) on perfectly
 * ordinary input. `on run argv` keeps the script text constant and the data out
 * of band — the same reason the repositories use bound parameters instead of
 * building SQL strings.
 *
 * macOS only; every entry point returns a null/empty result elsewhere. The
 * caller guards on process.platform too, so this is belt and braces.
 */

const execFileAsync = promisify(execFile);

/** Reminders is scripted per-item, so a slow call must not wedge the sync. */
const SCRIPT_TIMEOUT_MS = 20_000;

export interface ScriptResult {
  ok: boolean;
  /** stdout on success; a short reason on failure (surfaced in Settings). */
  value: string;
}

async function osascript(script: string, args: string[]): Promise<ScriptResult> {
  if (process.platform !== 'darwin') return { ok: false, value: 'not macOS' };
  try {
    // Full path: a packaged Electron app doesn't inherit the shell's PATH.
    const { stdout } = await execFileAsync(
      '/usr/bin/osascript',
      ['-e', script, ...args],
      { timeout: SCRIPT_TIMEOUT_MS },
    );
    return { ok: true, value: stdout.trim() };
  } catch (err) {
    // The message matters here, unlike the Apple Music module which can silently
    // return "nothing playing": a refused Automation permission is the single
    // most likely failure, and the user can only fix what they're told about.
    return { ok: false, value: failureReason(err) };
  }
}

/** osascript prefixes stderr with a source position: "104:161: execution error:". */
const POSITION_PREFIX = /^\d+:\d+:\s*/;

/**
 * Pull the actual reason out of an execFile rejection.
 *
 * It has to come from STDERR. execFile builds `err.message` by echoing the
 * command it ran, and the command here is the entire multi-line AppleScript —
 * so the front of that message is script source, not a diagnosis. Reading it
 * reported
 *
 *   "Command failed: /usr/bin/osascript -e on run argv set listName to item 1 of argv"
 *
 * for every single failure: it named neither the problem nor the fix, and it
 * threw away the "(-1743)" that describeFailure() keys the Automation-permission
 * message off, so the one error users actually hit could never be explained.
 * osascript puts the real thing on stderr:
 *
 *   "104:161: execution error: Reminders got an error: … (-1743)"
 */
export function failureReason(err: unknown): string {
  // A timeout kill leaves stderr empty, so it has to be recognised first —
  // otherwise it falls through to the bare command echo. The word "timed out"
  // is what describeFailure() matches on.
  if (typeof err === 'object' && err !== null && 'killed' in err && err.killed === true) {
    return `Reminders timed out after ${SCRIPT_TIMEOUT_MS / 1000}s`;
  }

  // `stderr` is attached by execFile but isn't on the Error type, so it's
  // narrowed by hand rather than cast away.
  const stderr =
    typeof err === 'object' && err !== null && 'stderr' in err && typeof err.stderr === 'string'
      ? err.stderr.trim()
      : '';
  if (stderr) {
    // First line only: osascript repeats the script on the lines below it.
    return stderr.split('\n')[0].replace(POSITION_PREFIX, '').trim();
  }

  // Nothing on stderr means it failed before the script ran (osascript missing,
  // spawn refused). The command echo is still noise — keep the shape, drop the
  // pasted-in script.
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0].replace(/^Command failed: \S+.*$/, 'Could not run osascript').trim();
}

/**
 * Build an AppleScript date from parts.
 *
 * `set day to 1` first is not superstition: setting the month while the current
 * day-of-month is 31 rolls the date into the next month (Jan 31 → "set month to
 * February" → Mar 2). Parking on the 1st makes every assignment order safe.
 */
const DATE_FROM_ARGS = `
  set d to current date
  set day of d to 1
  set year of d to (item 3 of argv) as integer
  set month of d to (item 4 of argv) as integer
  set day of d to (item 5 of argv) as integer
  set hours of d to (item 6 of argv) as integer
  set minutes of d to (item 7 of argv) as integer
  set seconds of d to 0
`;

function dueArgs(due: ReminderDueParts): string[] {
  return [due.year, due.month, due.day, due.hour, due.minute].map(String);
}

/**
 * Make sure the list exists, and confirm we're allowed to talk to Reminders at all.
 *
 * Returns ok:false with the OS error when Automation permission hasn't been
 * granted — the state the user has to resolve in System Settings, and the one
 * thing worth interrupting them about.
 */
export async function ensureList(listName: string): Promise<ScriptResult> {
  return osascript(
    `on run argv
       set listName to item 1 of argv
       tell application "Reminders"
         if not (exists list listName) then
           make new list with properties {name:listName}
         end if
         return "ok"
       end tell
     end run`,
    [listName],
  );
}

/** Create one reminder; resolves with the new reminder's id for the link table. */
export async function createReminder(listName: string, reminder: PlannedReminder): Promise<ScriptResult> {
  return osascript(
    `on run argv
       set listName to item 1 of argv
       set theName to item 2 of argv
       ${DATE_FROM_ARGS}
       set theBody to item 8 of argv
       tell application "Reminders"
         set theList to list listName
         -- "remind me date" is the property that actually alerts; "due date" alone
         -- files it under a day without ever notifying. Both are set so the item
         -- sorts correctly *and* speaks up.
         set r to make new reminder at end of theList with properties {name:theName, body:theBody, due date:d, remind me date:d}
         return id of r
       end tell
     end run`,
    [listName, reminder.title, ...dueArgs(reminder.due), reminder.body],
  );
}

/**
 * Update an existing reminder in place.
 *
 * Scoped to our own list rather than searching every reminder the user owns:
 * `whose id is` walks the collection, and walking one class list is cheap while
 * walking a life's worth of reminders is not.
 */
export async function updateReminder(
  listName: string,
  reminderId: string,
  reminder: PlannedReminder,
): Promise<ScriptResult> {
  return osascript(
    `on run argv
       set listName to item 1 of argv
       set theName to item 2 of argv
       ${DATE_FROM_ARGS}
       set theBody to item 8 of argv
       set theId to item 9 of argv
       tell application "Reminders"
         tell list listName
           set r to first reminder whose id is theId
           set name of r to theName
           set body of r to theBody
           set due date of r to d
           set remind me date of r to d
         end tell
         return "ok"
       end tell
     end run`,
    [listName, reminder.title, ...dueArgs(reminder.due), reminder.body, reminderId],
  );
}

/** Tick it off rather than delete it — finished work should read as finished. */
export async function completeReminder(listName: string, reminderId: string): Promise<ScriptResult> {
  return osascript(
    `on run argv
       set listName to item 1 of argv
       set theId to item 2 of argv
       tell application "Reminders"
         tell list listName
           set completed of (first reminder whose id is theId) to true
         end tell
         return "ok"
       end tell
     end run`,
    [listName, reminderId],
  );
}

export async function deleteReminder(listName: string, reminderId: string): Promise<ScriptResult> {
  return osascript(
    `on run argv
       set listName to item 1 of argv
       set theId to item 2 of argv
       tell application "Reminders"
         tell list listName
           delete (first reminder whose id is theId)
         end tell
         return "ok"
       end tell
     end run`,
    [listName, reminderId],
  );
}
