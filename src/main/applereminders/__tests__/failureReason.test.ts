import { describe, it, expect } from 'vitest';
import { failureReason } from '../remindersScript';

// The Apple Reminders sync reported "Command failed: /usr/bin/osascript -e on
// run argv  set listName to item 1 of argv" for every failure — execFile builds
// its message by echoing the command, and the command is the whole AppleScript.
// So the user was shown script source instead of a reason, and the "(-1743)"
// that describeFailure() turns into the System-Settings instructions never
// reached it. These lock the real reason to stderr.

/** An execFile rejection, shaped the way node actually builds it. */
function execFileError(opts: { stderr?: string; killed?: boolean }) {
  const err = new Error(
    'Command failed: /usr/bin/osascript -e on run argv\n' +
    '       set listName to item 1 of argv\n' +
    '       tell application "Reminders"\n',
  );
  return Object.assign(err, { stderr: opts.stderr ?? '', killed: opts.killed ?? false });
}

describe('failureReason', () => {
  it('reads the reason off stderr, not the echoed command', () => {
    const reason = failureReason(execFileError({
      stderr: '104:161: execution error: Not authorized to send Apple events to Reminders. (-1743)\n',
    }));

    expect(reason).toBe('execution error: Not authorized to send Apple events to Reminders. (-1743)');
    expect(reason).not.toContain('Command failed');
    expect(reason).not.toContain('on run argv');
  });

  it('keeps the error number, which is what the permission message keys off', () => {
    // describeFailure() in index.ts matches /-1743/ to explain the fix. If the
    // code is stripped here, that message can never fire.
    expect(failureReason(execFileError({
      stderr: '0:0: execution error: Reminders got an error: mumble (-1743)',
    }))).toContain('-1743');
  });

  it('strips osascript line:column prefixes', () => {
    expect(failureReason(execFileError({ stderr: '12:34: execution error: boom' })))
      .toBe('execution error: boom');
  });

  it('names a timeout, which leaves stderr empty', () => {
    // Without this the timeout falls through to the bare command echo, and
    // describeFailure()'s /timed out/ branch never matches either.
    expect(failureReason(execFileError({ killed: true }))).toMatch(/timed out/i);
  });

  it('degrades to a readable line when the script never ran', () => {
    const reason = failureReason(execFileError({}));
    expect(reason).toBe('Could not run osascript');
    expect(reason).not.toContain('argv');
  });

  it('survives a non-Error rejection', () => {
    expect(failureReason('something odd')).toBe('something odd');
  });
});
