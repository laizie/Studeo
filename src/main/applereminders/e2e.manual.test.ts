import { describe, it, expect, afterAll, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// TEMPORARY end-to-end test. Real orchestration + real Reminders.app, but against a
// throwaway database so the user's own data is never touched. Deleted after the run.
//
// Electron's userData is pointed at a temp dir, so initDb() builds a fresh schema
// there and settings.json lands there too.
const userDataDir = mkdtempSync(path.join(tmpdir(), 'studeo-e2e-'));
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }));

import { initDb, getDb } from '../db/connection';
import { syncAppleReminders, setAppleRemindersEnabled, stopAppleRemindersSync } from './index';

const execFileAsync = promisify(execFile);
const LIST = 'Studeo';

async function query(script: string, args: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script, ...args], { timeout: 30_000 });
  return stdout.trim();
}

/** Titles currently in the Studeo list, newline separated. */
function listContents(): Promise<string> {
  return query(
    `on run argv
       tell application "Reminders"
         if not (exists list (item 1 of argv)) then return "NO LIST"
         set out to ""
         repeat with r in (reminders of list (item 1 of argv))
           set out to out & (name of r) & " [completed=" & ((completed of r) as string) & "]" & linefeed
         end repeat
         return out
       end tell
     end run`,
    [LIST],
  );
}

afterAll(async () => {
  stopAppleRemindersSync();
  // Remove the whole list so the machine is left as we found it.
  await query(
    `on run argv
       tell application "Reminders"
         if (exists list (item 1 of argv)) then delete list (item 1 of argv)
       end tell
     end run`,
    [LIST],
  ).catch(() => undefined);
  rmSync(userDataDir, { recursive: true, force: true });
});

describe('end-to-end sync', () => {
  it('creates, updates, completes and removes reminders from real assignment data', async () => {
    initDb();
    const db = getDb();

    // A Fall-2026 course with two upcoming assignments — the shape of real data.
    db.exec(`
      INSERT INTO terms (id, name, start_date, end_date)
        VALUES ('t1', 'Fall 2026', '2026-08-17', '2026-12-09');
      INSERT INTO courses (id, name, abbreviation, color, term_id, created_at)
        VALUES ('c1', 'Data Structures', 'CSC 316', '#7b5c46', 't1', '2026-08-15');
      INSERT INTO assignments (id, course_id, name, type, status, due_date, due_time, created_at)
        VALUES ('a1', 'c1', 'Project 2', 'Project', 'not_started', '2026-08-28', '23:59', '2026-08-15'),
               ('a2', 'c1', 'Quiz 1',    'Quiz',    'not_started', '2026-08-21', NULL,    '2026-08-15');
    `);

    // Enabling persists the setting and runs the first pass.
    const afterEnable = await setAppleRemindersEnabled(true);
    console.log('after enable ->', JSON.stringify(afterEnable));
    expect(afterEnable.enabled).toBe(true);
    expect(afterEnable.lastError).toBeNull();
    expect(afterEnable.mirrored).toBe(2);

    const created = await listContents();
    console.log('list after create ->\n' + created);
    expect(created).toContain('CSC 316 — Project 2');
    expect(created).toContain('CSC 316 — Quiz 1');

    // An unchanged second pass must be a no-op, not a duplicate.
    const second = await syncAppleReminders();
    expect(second.mirrored).toBe(2);
    const afterSecond = await listContents();
    expect(afterSecond.split('CSC 316 — Quiz 1').length - 1).toBe(1);

    // Move a due date: the reminder is updated in place, still two items.
    db.exec(`UPDATE assignments SET due_date = '2026-09-04' WHERE id = 'a1'`);
    const afterMove = await syncAppleReminders();
    expect(afterMove.mirrored).toBe(2);
    expect(afterMove.lastError).toBeNull();
    const movedDay = await query(
      `on run argv
         tell application "Reminders"
           tell list (item 1 of argv)
             set r to first reminder whose name is "CSC 316 — Project 2"
             set d to remind me date of r
             return ((month of d as integer) as string) & "/" & ((day of d) as string)
           end tell
         end tell
       end run`,
      [LIST],
    );
    console.log('moved to ->', movedDay);
    expect(movedDay).toBe('9/4');

    // Finish one in Studeo: it gets ticked off rather than deleted.
    db.exec(`UPDATE assignments SET status = 'completed' WHERE id = 'a2'`);
    const afterComplete = await syncAppleReminders();
    expect(afterComplete.lastError).toBeNull();
    const completedList = await listContents();
    console.log('list after complete ->\n' + completedList);
    expect(completedList).toContain('CSC 316 — Quiz 1 [completed=true]');

    // Delete one in Studeo: the mirror goes away entirely.
    db.exec(`DELETE FROM assignments WHERE id = 'a1'`);
    const afterDelete = await syncAppleReminders();
    console.log('after delete ->', JSON.stringify(afterDelete));
    expect(afterDelete.lastError).toBeNull();
    const finalList = await listContents();
    console.log('final list ->\n' + finalList);
    expect(finalList).not.toContain('CSC 316 — Project 2');
  }, 240_000);
});
