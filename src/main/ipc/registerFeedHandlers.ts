import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';

// We do the network fetch here in MAIN, not the renderer, for two reasons:
//  1. The renderer is sandboxed and a cross-origin fetch would be blocked by the
//     browser's CORS policy — an LMS feed server won't send CORS headers for us.
//  2. Network access belongs on the trusted side of the process boundary, the
//     same place the Spotify/Apple Music calls already live.
// We return only the raw .ics text; parsing happens in the pure shared parser.

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
