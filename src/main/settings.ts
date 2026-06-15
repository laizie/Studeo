import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A tiny key-value store for app preferences, persisted as JSON in the user-data folder.
//
// Why this lives in main rather than the renderer's localStorage: in a packaged build the
// renderer is loaded from a file:// URL, and Chromium does not reliably persist localStorage
// for file:// origins across a full quit/relaunch. A file the main process owns always
// persists. Keep this for small UI preferences (theme, …) — bulk data still belongs in the DB.

type Settings = Record<string, string>;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

// Read once and cache; writes update the cache and the file together.
let cache: Settings | null = null;

function load(): Settings {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf-8'));
    cache = parsed && typeof parsed === 'object' ? (parsed as Settings) : {};
  } catch {
    // No file yet (first run) or unreadable — start empty.
    cache = {};
  }
  return cache;
}

export function getSetting(key: string): string | null {
  return load()[key] ?? null;
}

/** A copy of every saved preference — used to hydrate the renderer in one synchronous read. */
export function getAllSettings(): Settings {
  return { ...load() };
}

export function setSetting(key: string, value: string): void {
  const s = load();
  s[key] = value;
  try {
    writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  } catch {
    /* best-effort: a failed write just means the preference isn't remembered */
  }
}
