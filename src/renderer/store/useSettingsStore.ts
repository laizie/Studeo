import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'warm';
export type MusicService = 'spotify' | 'apple_music';

interface SettingsState {
  theme: Theme;
  setTheme: (t: Theme) => void;

  defaultMusicService: MusicService | null;
  setDefaultMusicService: (s: MusicService | null) => void;

  classRemindersEnabled: boolean;
  setClassRemindersEnabled: (v: boolean) => void;
  reminderLeadMinutes: number;
  setReminderLeadMinutes: (m: number) => void;

  dueDigestEnabled: boolean;
  setDueDigestEnabled: (v: boolean) => void;
  dueDigestTime: string; // "HH:MM" 24h local
  setDueDigestTime: (t: string) => void;
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

const storedTheme = localStorage.getItem('studeo:theme') as Theme | null;
// Back-compat: migrate old darkMode flag to theme
const legacyDark  = localStorage.getItem('studeo:darkMode') === 'true';
const initTheme: Theme = storedTheme ?? (legacyDark ? 'warm' : 'light');
applyTheme(initTheme);

const storedMusic = localStorage.getItem('studeo:defaultMusicService');
const initMusic: MusicService | null =
  storedMusic === 'spotify' || storedMusic === 'apple_music' ? storedMusic : null;

const initRemindersEnabled = localStorage.getItem('studeo:classRemindersEnabled') === 'true';
const storedLead = parseInt(localStorage.getItem('studeo:reminderLeadMinutes') ?? '', 10);
const initLeadMinutes = isNaN(storedLead) ? 10 : storedLead;

const initDueDigestEnabled = localStorage.getItem('studeo:dueDigestEnabled') === 'true';
const storedDigestTime = localStorage.getItem('studeo:dueDigestTime');
const initDueDigestTime =
  storedDigestTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(storedDigestTime) ? storedDigestTime : '18:00';

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
    localStorage.setItem('studeo:theme', t);
    applyTheme(t);
    set({ theme: t });
  },

  defaultMusicService: initMusic,

  setDefaultMusicService: (s) => {
    if (s === null) localStorage.removeItem('studeo:defaultMusicService');
    else localStorage.setItem('studeo:defaultMusicService', s);
    set({ defaultMusicService: s });
  },

  classRemindersEnabled: initRemindersEnabled,
  setClassRemindersEnabled: (v) => {
    localStorage.setItem('studeo:classRemindersEnabled', String(v));
    const s = get();
    pushReminderConfig(v, s.reminderLeadMinutes, s.dueDigestEnabled, s.dueDigestTime);
    set({ classRemindersEnabled: v });
  },

  reminderLeadMinutes: initLeadMinutes,
  setReminderLeadMinutes: (m) => {
    localStorage.setItem('studeo:reminderLeadMinutes', String(m));
    const s = get();
    pushReminderConfig(s.classRemindersEnabled, m, s.dueDigestEnabled, s.dueDigestTime);
    set({ reminderLeadMinutes: m });
  },

  dueDigestEnabled: initDueDigestEnabled,
  setDueDigestEnabled: (v) => {
    localStorage.setItem('studeo:dueDigestEnabled', String(v));
    const s = get();
    pushReminderConfig(s.classRemindersEnabled, s.reminderLeadMinutes, v, s.dueDigestTime);
    set({ dueDigestEnabled: v });
  },

  dueDigestTime: initDueDigestTime,
  setDueDigestTime: (t) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return;
    localStorage.setItem('studeo:dueDigestTime', t);
    const s = get();
    pushReminderConfig(s.classRemindersEnabled, s.reminderLeadMinutes, s.dueDigestEnabled, t);
    set({ dueDigestTime: t });
  },
}));
