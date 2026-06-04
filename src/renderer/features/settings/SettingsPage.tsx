import { Moon, Sun } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { cn } from '../../lib/utils';

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-[#e2a53b]' : 'bg-stone-300 dark:bg-stone-600',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { darkMode, toggleDarkMode } = useSettingsStore();

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-800 dark:text-stone-100 mb-1">Settings</h1>
      <p className="text-sm text-stone-400 dark:text-stone-500 mb-8">Preferences for ClassTrack</p>

      {/* Appearance section */}
      <div>
        <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">
          Appearance
        </h2>

        <div className="bg-white dark:bg-stone-800 border border-[#e8ddd0] dark:border-stone-700 rounded-xl shadow-sm divide-y divide-[#e8ddd0] dark:divide-stone-700">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              {darkMode ? (
                <Moon size={17} className="text-stone-400 dark:text-stone-400" />
              ) : (
                <Sun size={17} className="text-stone-400" />
              )}
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-200">Dark mode</p>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                  {darkMode ? 'On — using dark theme' : 'Off — using light theme'}
                </p>
              </div>
            </div>
            <ToggleSwitch checked={darkMode} onChange={toggleDarkMode} />
          </div>
        </div>
      </div>
    </div>
  );
}
