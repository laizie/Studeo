import { vi } from 'vitest';

/**
 * A stand-in for `ipcMain` that captures registered handlers so tests can call them.
 *
 * The IPC layer is the app's trust boundary — it's the only thing between untrusted
 * renderer input and the database — and it had no tests at all. It's also the cheapest
 * layer to test: every handler is a plain function of (event, ...args), so with
 * `ipcMain` stubbed and `getDb()` pointed at an in-memory database, a test can exercise
 * the real validation and the real SQL with no Electron process anywhere.
 *
 * Usage (the electron + connection mocks must be hoisted in the test file itself,
 * because vi.mock is hoisted above imports):
 *
 *   registerAssignmentHandlers();
 *   await invoke(IPC.ASSIGNMENTS.CREATE, { courseId, name: 'Lab', dueDate: '2026-01-01' });
 */
type Handler = (event: unknown, ...args: unknown[]) => unknown;

const handlers = new Map<string, Handler>();

export const ipcMainStub = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers.set(channel, handler);
  }),
  on: vi.fn(),
};

/** Call a registered handler the way ipcRenderer.invoke would. */
export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for "${channel}"`);
  // Handlers receive an IpcMainInvokeEvent first; the ones under test ignore it, apart
  // from the window-scoped ones which aren't covered here.
  return (await handler({}, ...args)) as T;
}

export function resetHandlers(): void {
  handlers.clear();
  ipcMainStub.handle.mockClear();
}
