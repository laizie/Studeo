// Small UI preferences (theme, page filters, toggles) — read once at startup,
// written back the moment they change.
//
// Why not localStorage: in a packaged build the renderer loads from a file:// URL,
// and Chromium does not reliably keep localStorage for file:// origins across a full
// quit/relaunch. The main process owns a settings.json instead; preload reads the
// whole file synchronously at startup and hands it over as `initialSettings`, so
// hydration here is a plain object lookup with no async gap and no flash of defaults.
//
// This is the ONE place that talks to that bridge. Bulk data still belongs in the DB.

// Keys are typed against the shared allowlist rather than plain strings: main REFUSES
// to write a key that isn't on it, so an unlisted key here would be a preference that
// looks saved, warns only to a console nobody reads, and quietly resets every launch.
// Typing it makes that a compile error instead.
import type { SettingKey } from '../../shared/settingsKeys';

const initial: Record<string, string> = window.api?.app?.initialSettings ?? {};

/**
 * Read a preference. Prefers the main-process value; if the key only exists in the
 * old localStorage, the value is returned AND pushed forward into main so the next
 * launch finds it in the file. Returns null when nothing is stored.
 */
export function readPref(key: SettingKey, legacyLsKey?: string): string | null {
  if (initial[key] !== undefined) return initial[key];
  if (!legacyLsKey) return null;
  const legacy = localStorage.getItem(legacyLsKey);
  if (legacy !== null) writePref(key, legacy);
  return legacy;
}

/** Persist a preference. Fire-and-forget: a failed write only costs us the memory. */
export function writePref(key: SettingKey, value: string): void {
  window.api?.app?.setSetting(key, value);
}

/** A stored boolean, with an explicit default for "never set". */
export function readBoolPref(key: SettingKey, fallback: boolean): boolean {
  const raw = readPref(key);
  return raw === null ? fallback : raw === 'true';
}

/**
 * A stored value constrained to a known set. Anything unrecognised (a hand-edited
 * settings.json, or an option removed in a later version) falls back rather than
 * putting the UI into a state it has no code for.
 */
export function readEnumPref<T extends string>(key: SettingKey, allowed: readonly T[], fallback: T): T {
  const raw = readPref(key);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}
