import { session, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { ASSET_SCHEME } from './media';

// Renderer hardening — the half that `contextIsolation` / `nodeIntegration: false` /
// `sandbox` (set in main.ts) don't cover.
//
// Those three stop the renderer reaching Node. These rules govern what the *page* is
// allowed to pull in and where it's allowed to go, which matters because real outside
// content flows through this app: .ics feeds from an LMS, text extracted from arbitrary
// PDFs, note documents, and track metadata from Spotify / Apple Music. None of it is
// rendered as HTML today — but "today" is the only word doing the work in that sentence,
// and a desktop window with no address bar has no way for a user to recover from a
// navigation they didn't ask for.
//
// Two mechanisms:
//   1. A Content-Security-Policy header, so the page can only load what we list.
//   2. Navigation + window-open guards, so links leave through the OS browser and the
//      app window itself can never be steered somewhere else.

/**
 * Build the CSP.
 *
 * `devServerUrl` is set only under `npm start`, where Vite serves the renderer over
 * http://localhost and needs two extra allowances the packaged app must NOT get:
 * an inline script (the react-refresh preamble Vite injects into index.html) and a
 * websocket (HMR). The production build has neither — its index.html is a plain
 * external <script type="module"> and every asset is a local file — so the shipped
 * policy stays strict.
 *
 * Directive notes:
 * - `style-src` needs 'unsafe-inline' in both modes and that isn't going away: the app
 *   styles course accents with React `style={{ backgroundColor: course.color }}` props
 *   throughout, and BlockNote/Mantine inject their own <style> tags. Inline *styles*
 *   are a far smaller risk than inline scripts.
 * - `img-src` carries the app's three real image origins: `studeo-asset:` (note images
 *   from the data folder), `data:` (Apple Music artwork arrives base64-encoded from
 *   AppleScript), and `https:` (Spotify album art is a remote CDN URL).
 * - `connect-src` is 'self' only, and in production that is effectively "nothing": the
 *   renderer makes no fetch/XHR/WebSocket calls at all — every network request in this
 *   app happens in main, behind IPC. That's what makes the local-first promise checkable
 *   rather than aspirational.
 * - `default-src 'none'` means anything not listed is denied, so a directive we forgot
 *   fails closed and loudly in the console rather than silently allowing something.
 */
function buildCsp(devServerUrl: string | undefined): string {
  const script = devServerUrl ? "'self' 'unsafe-inline'" : "'self'";
  const connect = devServerUrl ? "'self' ws: http://localhost:* http://127.0.0.1:*" : "'self'";

  return [
    "default-src 'none'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${ASSET_SCHEME}:`,
    "font-src 'self' data:",
    `media-src 'self' blob: ${ASSET_SCHEME}:`,
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    // Nothing in this app frames, embeds, or submits a form. Deny all three outright
    // so any future attempt is a visible error rather than a quiet new attack surface.
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    // Stops injected content from rewriting how every relative URL on the page resolves.
    "base-uri 'none'",
  ].join('; ');
}

/**
 * Attach the CSP to every response the app's session serves, and lock down the
 * permissions the renderer may request.
 *
 * Sent as a header rather than a <meta> tag: a header can differ between dev and
 * production, applies to every response (not just the document), and can't be
 * removed by anything that manages to touch the DOM.
 */
export function applySessionSecurity(devServerUrl: string | undefined): void {
  const csp = buildCsp(devServerUrl);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Notifications are the one web permission this app actually uses (timer phase-end
  // alerts). Everything else — camera, mic, geolocation, clipboard-read, MIDI — is
  // denied, so a permission prompt can never appear for something we don't ship.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });
}

/**
 * Keep the window pointed at our own page, forever.
 *
 * `initialUrl` is what the window was told to load. Any *document* navigation away
 * from it is refused; if it looks like a normal web link we hand it to the OS browser
 * instead, which is what the user meant by clicking it anyway.
 *
 * HashRouter is unaffected: in-page hash changes are same-document navigations and
 * never fire `will-navigate`, so app routing keeps working normally. Anything that
 * *does* fire it is a real navigation, and this app has no legitimate reason for one.
 */
export function hardenWindow(win: BrowserWindow, initialUrl: string): void {
  const sameDocument = (url: string): boolean => {
    try {
      const a = new URL(url);
      const b = new URL(initialUrl);
      a.hash = '';
      b.hash = '';
      return a.href === b.href;
    } catch {
      return false;
    }
  };

  const openExternally = (url: string): void => {
    // Only ever hand http(s) to the OS. Without this check a `file:///…` or a
    // custom-scheme URL from injected content would become "ask the OS to run this".
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
  };

  win.webContents.on('will-navigate', (event, url) => {
    if (sameDocument(url)) return;
    event.preventDefault();
    openExternally(url);
  });

  // target="_blank", window.open(), and anything else asking for a new window: never
  // give it one. A second Electron window would come up without our webPreferences.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
}
