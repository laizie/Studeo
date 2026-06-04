import { create } from 'zustand';

interface SettingsState {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const initDark = localStorage.getItem('classtrack:darkMode') === 'true';
// Apply immediately at module load so there's no flash of wrong theme.
document.documentElement.classList.toggle('dark', initDark);

export const useSettingsStore = create<SettingsState>()((set) => ({
  darkMode: initDark,

  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      localStorage.setItem('classtrack:darkMode', String(next));
      document.documentElement.classList.toggle('dark', next);
      return { darkMode: next };
    }),
}));
