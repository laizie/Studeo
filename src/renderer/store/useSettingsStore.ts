import { create } from 'zustand';

export type MusicService = 'spotify' | 'apple_music';

interface SettingsState {
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Which music service to show in the sidebar and Study page.
  // null = user hasn't chosen yet; prompt them to go to Settings.
  defaultMusicService: MusicService | null;
  setDefaultMusicService: (s: MusicService | null) => void;
}

const initDark = localStorage.getItem('classtrack:darkMode') === 'true';
document.documentElement.classList.toggle('dark', initDark);

const storedMusic = localStorage.getItem('classtrack:defaultMusicService');
const initMusic: MusicService | null =
  storedMusic === 'spotify' || storedMusic === 'apple_music' ? storedMusic : null;

export const useSettingsStore = create<SettingsState>()((set) => ({
  darkMode: initDark,

  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      localStorage.setItem('classtrack:darkMode', String(next));
      document.documentElement.classList.toggle('dark', next);
      return { darkMode: next };
    }),

  defaultMusicService: initMusic,

  setDefaultMusicService: (s) => {
    if (s === null) localStorage.removeItem('classtrack:defaultMusicService');
    else localStorage.setItem('classtrack:defaultMusicService', s);
    set({ defaultMusicService: s });
  },
}));
