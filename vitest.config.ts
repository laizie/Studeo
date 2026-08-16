import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // *.manual.test.ts drive real macOS apps (Reminders) through AppleScript: they
    // need a logged-in GUI session and granted Automation permission, so they can't
    // run in CI or alongside the normal suite. They are kept because they earn their
    // keep — the Apple Reminders pair caught two bugs no unit test could see, one of
    // which left reminders stranded on the phone forever. Run them deliberately:
    //   npx vitest run src/main/applereminders/e2e.manual.test.ts
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.manual.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/shared/**/*.ts',
        'src/main/db/repositories/**/*.ts',
        // The IPC handlers are the trust boundary — untrusted renderer input on one
        // side, the database on the other — so they belong in the gate. Only the ones
        // that actually validate: the music/media/spotify handlers are thin pass-throughs
        // to OS integrations that can't run headless.
        'src/main/ipc/registerAssignmentHandlers.ts',
        'src/main/ipc/registerTaskHandlers.ts',
        'src/main/ipc/registerCourseHandlers.ts',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/shared/types.ts',   // type definitions and constants only, no logic
      ],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   75,
        statements: 80,
      },
    },
  },
});
