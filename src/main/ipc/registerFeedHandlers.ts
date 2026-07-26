import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';

// We do the network fetch here in MAIN, not the renderer, for two reasons:
//  1. The renderer is sandboxed and a cross-origin fetch would be blocked by the
//     browser's CORS policy — an LMS feed server won't send CORS headers for us.
//  2. Network access belongs on the trusted side of the process boundary, the
//     same place the Spotify/Apple Music calls already live.
// We return only the raw .ics text; parsing happens in the pure shared parser.

/**
 * Reject addresses that point back at the user's own machine.
 *
 * main runs with no browser sandbox and no CORS, so it can reach things the renderer
 * can't — including services bound to loopback and the link-local metadata range. The
 * URL is typed by a human here, so this is not a live threat; it's a cheap guard on a
 * function whose whole job is "fetch whatever string you're handed", and it costs a
 * legitimate feed nothing.
 *
 * Deliberately narrow: LAN addresses (192.168.x, 10.x) stay allowed, because a student
 * self-hosting a calendar on their own network is a real thing and blocking it would be
 * paternalistic. Note this checks only the URL given — fetch follows redirects, and the
 * hops aren't re-checked. Closing that would mean handling redirects manually, which is
 * more machinery than a human-entered URL warrants.
 */
function isLoopbackOrLinkLocal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0.0.0.0' || h === '::') return true;
  if (/^127\./.test(h)) return true;          // loopback
  if (/^169\.254\./.test(h)) return true;     // link-local, incl. the metadata address
  if (/^fe80:/i.test(h)) return true;         // IPv6 link-local
  return false;
}

const FIFTEEN_SECONDS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — a personal feed is a few KB; cap pathological inputs.

export function registerFeedHandlers(): void {
  ipcMain.handle(IPC.FEEDS.FETCH_ICS, async (_event, url: unknown): Promise<{ text: string }> => {
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('A feed URL is required.');
    }

    // Validate the URL and only allow http(s) — never let a pasted string point
    // main at a local file:// path or some other scheme.
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error("That doesn't look like a valid URL.");
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('The feed URL must start with https:// or http://');
    }
    if (isLoopbackOrLinkLocal(parsed.hostname)) {
      throw new Error('That address points back at this machine, not at a calendar feed.');
    }

    let res: Response;
    try {
      res = await fetch(parsed, { signal: AbortSignal.timeout(FIFTEEN_SECONDS) });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error('The feed took too long to respond. Check the URL and try again.');
      }
      throw new Error("Couldn't reach that URL. Check your connection and the address.");
    }

    if (!res.ok) {
      throw new Error(`The feed server returned an error (${res.status}). Double-check the URL.`);
    }

    const text = await res.text();
    if (text.length > MAX_BYTES) {
      throw new Error('That feed is unexpectedly large and was not loaded.');
    }
    if (!text.includes('BEGIN:VCALENDAR')) {
      throw new Error("That URL didn't return a calendar feed. Make sure it's the .ics feed link.");
    }

    return { text };
  });
}
