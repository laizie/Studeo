import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Where the renderer document lives, for whichever window is asking.
 *
 * Two shapes, because Forge's Vite plugin serves the renderer over http://localhost
 * under `npm start` and as a plain file:// document in a packaged build. Every window
 * needs the same answer, and the pop-out timer made "every window" plural — so it's
 * resolved in one place rather than copy-pasted per `new BrowserWindow`.
 *
 * `hash` picks the route inside that one document (the app uses HashRouter, so a
 * hash is the whole navigation). Note that hardenWindow() compares URLs with the
 * hash stripped, which is exactly right: the pop-out and the main window are the
 * same allowed document, just at different routes.
 */
export function rendererUrl(hash = ''): string {
  const base = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : pathToFileURL(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      ).href;
  return hash ? `${base}${hash}` : base;
}

/** The route the floating Pomodoro pop-out renders. */
export const MINI_TIMER_HASH = '#/mini-timer';
