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

// The reminder scheduler lives in the main process, which can't read
// localStorage — push the saved preference over IPC on startup and on change.
function pushReminderConfig(enabled: boolean, leadMinutes: number): void {
  window.api.reminders.configure({ enabled, leadMinutes }).catch(() => { /* best-effort */ });
}
pushReminderConfig(initRemindersEnabled, initLeadMinutes);

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
    pushReminderConfig(v, get().reminderLeadMinutes);
    set({ classRemindersEnabled: v });
  },

  reminderLeadMinutes: initLeadMinutes,
  setReminderLeadMinutes: (m) => {
    localStorage.setItem('studeo:reminderLeadMinutes', String(m));
    pushReminderConfig(get().classRemindersEnabled, m);
    set({ reminderLeadMinutes: m });
  },
}));
