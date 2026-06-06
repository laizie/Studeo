import { create } from 'zustand';

export type Theme = 'light' | 'warm';
export type MusicService = 'spotify' | 'apple_music';

interface SettingsState {
  theme: Theme;
  setTheme: (t: Theme) => void;

  defaultMusicService: MusicService | null;
  setDefaultMusicService: (s: MusicService | null) => void;
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('dark');
  html.removeAttribute('data-theme');

  if (theme === 'warm') {
    // Apply .dark so all dark: text/color utilities resolve (light text, warm accents).
    // Apply data-theme="warm" so warm: bg utilities override dark: bg utilities.
    html.classList.add('dark');
    html.setAttribute('data-theme', 'warm');
  }
}

const storedTheme = localStorage.getItem('classtrack:theme') as Theme | null;
// Back-compat: migrate old darkMode flag to theme
const legacyDark  = localStorage.getItem('classtrack:darkMode') === 'true';
const initTheme: Theme = storedTheme ?? (legacyDark ? 'warm' : 'light');
applyTheme(initTheme);

const storedMusic = localStorage.getItem('classtrack:defaultMusicService');
const initMusic: MusicService | null =
  storedMusic === 'spotify' || storedMusic === 'apple_music' ? storedMusic : null;

export const useSettingsStore = create<SettingsState>()((set) => ({
  theme: initTheme,

  setTheme: (t) => {
    localStorage.setItem('classtrack:theme', t);
    applyTheme(t);
    set({ theme: t });
  },

  defaultMusicService: initMusic,

  setDefaultMusicService: (s) => {
    if (s === null) localStorage.removeItem('classtrack:defaultMusicService');
    else localStorage.setItem('classtrack:defaultMusicService', s);
    set({ defaultMusicService: s });
  },
}));
