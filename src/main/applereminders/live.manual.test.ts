import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ensureList,
  createReminder,
  updateReminder,
  completeReminder,
  deleteReminder,
} from './remindersScript';
import type { PlannedReminder } from '../../shared/appleReminderSync';

// TEMPORARY manual test — drives a real Reminders.app against a scratch list.
// Not part of the suite; deleted after the run.

const execFileAsync = promisify(execFile);
const LIST = 'Studeo Live Test';

const reminder: PlannedReminder = {
  assignmentId: 'a1',
  title: "CSC 316 — Priya's Project 2 \"final\"", // apostrophe + quotes on purpose
  body: 'Project · Data Structures\n\nch. 4-6, submit on Canvas',
  due: { year: 2026, month: 8, day: 20, hour: 14, minute: 30 },
  signature: 'sig-1',
};

async function query(script: string, args: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script, ...args], { timeout: 30_000 });
  return stdout.trim();
}

describe('live Reminders round-trip', () => {
  it('creates, updates, completes, and deletes', async () => {
    expect((await ensureList(LIST)).ok).toBe(true);

    const created = await createReminder(LIST, reminder);
    console.log('create ->', JSON.stringify(created));
    expect(created.ok).toBe(true);
    expect(created.value).toBeTruthy();
    const id = created.value;

    // Read it back: name, body and the alert time must be what we asked for.
    const readBack = await query(
      `on run argv
         set listName to item 1 of argv
         set theId to item 2 of argv
         tell application "Reminders"
           tell list listName
             set r to first reminder whose id is theId
             set d to remind me date of r
             return (name of r) & "||" & (body of r) & "||" & ((year of d) as string) & "-" & ((month of d as integer) as string) & "-" & ((day of d) as string) & " " & ((hours of d) as string) & ":" & ((minutes of d) as string)
           end tell
         end tell
       end run`,
      [LIST, id],
    );
    console.log('readBack ->', readBack);
    const [name, body, when] = readBack.split('||');
    expect(name).toBe(reminder.title);
    expect(body.replace(/\r/g, '\n')).toContain('submit on Canvas');
    expect(when).toBe('2026-8-20 14:30');

    // Update in place — same id, new title and date.
    const moved: PlannedReminder = {
      ...reminder,
      title: 'CSC 316 — Project 2 (revised)',
      due: { ...reminder.due, day: 27, hour: 9, minute: 0 },
    };
    expect((await updateReminder(LIST, id, moved)).ok).toBe(true);

    const afterUpdate = await query(
      `on run argv
         tell application "Reminders"
           tell list (item 1 of argv)
             set r to first reminder whose id is (item 2 of argv)
             set d to remind me date of r
             return (name of r) & "||" & ((day of d) as string) & " " & ((hours of d) as string)
           end tell
         end tell
       end run`,
      [LIST, id],
    );
    console.log('afterUpdate ->', afterUpdate);
    expect(afterUpdate).toBe('CSC 316 — Project 2 (revised)||27 9');

    // Complete, then confirm it reads as done rather than vanishing.
    expect((await completeReminder(LIST, id)).ok).toBe(true);
    const completed = await query(
      `on run argv
         tell application "Reminders"
           tell list (item 1 of argv)
             return (completed of (first reminder whose id is (item 2 of argv))) as string
           end tell
         end tell
       end run`,
      [LIST, id],
    );
    console.log('completed ->', completed);
    expect(completed).toBe('true');

    // Delete, and confirm it's gone.
    expect((await deleteReminder(LIST, id)).ok).toBe(true);
    const remaining = await query(
      `on run argv
         tell application "Reminders"
           return (count of reminders of list (item 1 of argv)) as string
         end tell
       end run`,
      [LIST],
    );
    console.log('remaining ->', remaining);
    expect(remaining).toBe('0');
  }, 180_000);

  // The self-healing path depends on these two REPORTING failure for an id that's
  // gone (deleted on the phone): the sync drops the link and recreates it next pass.
  // If they silently succeeded, a reminder deleted on the phone would never come back.
  it('update and complete fail for a reminder id that no longer exists', async () => {
    const update = await updateReminder(LIST, 'x-apple-reminder://NOPE', reminder);
    const complete = await completeReminder(LIST, 'x-apple-reminder://NOPE');
    console.log('missing update   ->', JSON.stringify(update));
    console.log('missing complete ->', JSON.stringify(complete));
    expect(update.ok).toBe(false);
    expect(complete.ok).toBe(false);
  }, 60_000);

  // delete is the exception, and harmlessly so: AppleScript resolves the `whose`
  // specifier to an empty match and no-ops instead of erroring. "Already gone" is
  // the outcome delete wanted, and the sync drops the link either way.
  it('delete is a no-op for an id that no longer exists', async () => {
    const result = await deleteReminder(LIST, 'x-apple-reminder://NOPE');
    console.log('missing delete ->', JSON.stringify(result));
    expect(result.ok).toBe(true);
  }, 60_000);
});
