import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'warm';
export type MusicService = 'spotify' | 'apple_music';

interface SettingsState {
  theme: Theme;
  setTheme: (t: Theme) => void;

  defaultMusicService: MusicService | null;
  setDefaultMusicService: (s: MusicService | null) => void;

  /** Collapse the music UI to just the now-playing card (hide playlists + search). */
  nowPlayingOnly: boolean;
  setNowPlayingOnly: (v: boolean) => void;

  classRemindersEnabled: boolean;
  setClassRemindersEnabled: (v: boolean) => void;
  reminderLeadMinutes: number;
  setReminderLeadMinutes: (m: number) => void;

  dueDigestEnabled: boolean;
  setDueDigestEnabled: (v: boolean) => void;
  dueDigestTime: string; // "HH:MM" 24h local
  setDueDigestTime: (t: string) => void;

  /** Soft chime when a focus/break phase ends (the timer reads this directly). */
  timerSoundEnabled: boolean;
  setTimerSoundEnabled: (v: boolean) => void;

  /** Show the "How did it go?" reflection card in Focus Mode after each focus block. */
  reflectionPromptEnabled: boolean;
  setReflectionPromptEnabled: (v: boolean) => void;
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('dark');
  html.removeAttribute('data-theme');

  if (theme === 'dark') {
    // Pure dark: the deep-espresso layer defined under the dark: variant.
    html.classList.add('dark');
  } else if (theme === 'warm') {
    // Apply .dark so all dark: text/color utilities resolve (light text, warm accents).
    // Apply data-theme="warm" so warm: bg utilities override dark: bg utilities.
    html.classList.add('dark');
    html.setAttribute('data-theme', 'warm');
  }
}

// All preferences are persisted by the main process (a file it owns), because the renderer
// loads from file:// in packaged builds where localStorage isn't reliably kept across a
// relaunch. `initialSettings` was read synchronously at preload time.
const initial = window.api?.app?.initialSettings ?? {};

// Read a preference: prefer the main-process value; otherwise fall back to the value still
// in the old localStorage and push it forward into main so it persists from now on.
function readSetting(key: string, legacyLsKey: string): string | null {
  if (initial[key] !== undefined) return initial[key];
  const legacy = localStorage.getItem(legacyLsKey);
  if (legacy !== null) window.api?.app?.setSetting(key, legacy);
  return legacy;
}

function saveSetting(key: string, value: string): void {
  window.api?.app?.setSetting(key, value);
}

const storedTheme = readSetting('theme', 'studeo:theme') as Theme | null;
// Back-compat: migrate the even older darkMode flag to a theme.
const legacyDark = !storedTheme && localStorage.getItem('studeo:darkMode') === 'true';
const initTheme: Theme = storedTheme ?? (legacyDark ? 'warm' : 'light');
if (!storedTheme && legacyDark) saveSetting('theme', initTheme);
applyTheme(initTheme);

const storedMusic = readSetting('defaultMusicService', 'studeo:defaultMusicService');
const initMusic: MusicService | null =
  storedMusic === 'spotify' || storedMusic === 'apple_music' ? storedMusic : null;

const initNowPlayingOnly = readSetting('nowPlayingOnly', 'studeo:nowPlayingOnly') === 'true';

const initRemindersEnabled = readSetting('classRemindersEnabled', 'studeo:classRemindersEnabled') === 'true';
const storedLead = parseInt(readSetting('reminderLeadMinutes', 'studeo:reminderLeadMinutes') ?? '', 10);
const initLeadMinutes = isNaN(storedLead) ? 10 : storedLead;

const initDueDigestEnabled = readSetting('dueDigestEnabled', 'studeo:dueDigestEnabled') === 'true';
const storedDigestTime = readSetting('dueDigestTime', 'studeo:dueDigestTime');
const initDueDigestTime =
  storedDigestTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(storedDigestTime) ? storedDigestTime : '18:00';

const initTimerSound = readSetting('timerSound', 'studeo:timerSound') !== 'false';

// Default ON — closing the loop with a one-line reflection is part of the Focus Mode ritual.
const initReflectionPrompt = readSetting('reflectionPrompt', 'studeo:reflectionPrompt') !== 'false';

// The reminder scheduler lives in the main process, which can't read
// localStorage — push the saved preference over IPC on startup and on change.
function pushReminderConfig(
  enabled: boolean,
  leadMinutes: number,
  dueDigestEnabled: boolean,
  dueDigestTime: string,
): void {
  window.api.reminders
    .configure({ enabled, leadMinutes, dueDigestEnabled, dueDigestTime })
    .catch(() => { /* best-effort */ });
}
pushReminderConfig(initRemindersEnabled, initLeadMinutes, initDueDigestEnabled, initDueDigestTime);

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: initTheme,

  setTheme: (t) => {
    saveSetting('theme', t);   // persisted in main — survives a full quit/relaunch
    applyTheme(t);
    set({ theme: t });
  },

  defaultMusicService: initMusic,

  setDefaultMusicService: (s) => {
    // Empty string represents "none" — read-side only accepts the two known services.
    saveSetting('defaultMusicService', s ?? '');
    set({ defaultMusicService: s });
  },

  nowPlayingOnly: initNowPlayingOnly,
  setNowPlayingOnly: (v) => {
    saveSetting('nowPlayingOnly', String(v));
    set({ nowPlayingOnly: v });
  },

  classRemindersEnabled: initRemindersEnabled,
  setClassRemindersEnabled: (v) => {
    saveSetting('classRemindersEnabled', String(v));
    const s = get();
    pushReminderConfig(v, s.reminderLeadMinutes, s.dueDigestEnabled, s.dueDigestTime);
    set({ classRemindersEnabled: v });
  },

  reminderLeadMinutes: initLeadMinutes,
  setReminderLeadMinutes: (m) => {
    saveSetting('reminderLeadMinutes', String(m));
    const s = get();
    pushReminderConfig(s.classRemindersEnabled, m, s.dueDigestEnabled, s.dueDigestTime);
    set({ reminderLeadMinutes: m });
  },

  dueDigestEnabled: initDueDigestEnabled,
  setDueDigestEnabled: (v) => {
    saveSetting('dueDigestEnabled', String(v));
    const s = get();
    pushReminderConfig(s.classRemindersEnabled, s.reminderLeadMinutes, v, s.dueDigestTime);
    set({ dueDigestEnabled: v });
  },

  dueDigestTime: initDueDigestTime,
  setDueDigestTime: (t) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return;
    saveSetting('dueDigestTime', t);
    const s = get();
    pushReminderConfig(s.classRemindersEnabled, s.reminderLeadMinutes, s.dueDigestEnabled, t);
    set({ dueDigestTime: t });
  },

  // Default ON — the chime has always played; absence of the key means "keep it".
  timerSoundEnabled: initTimerSound,
  setTimerSoundEnabled: (v) => {
    saveSetting('timerSound', String(v));
    set({ timerSoundEnabled: v });
  },

  reflectionPromptEnabled: initReflectionPrompt,
  setReflectionPromptEnabled: (v) => {
    saveSetting('reflectionPrompt', String(v));
    set({ reflectionPromptEnabled: v });
  },
}));
