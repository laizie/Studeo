import { Check } from 'lucide-react';
import { useSettingsStore, type Theme } from '../../store/useSettingsStore';
import { cn } from '../../lib/utils';

// Swatch strips are the actual theme token values, so the preview is honest.
const OPTIONS: { id: Theme; label: string; desc: string; swatches: string[] }[] = [
  {
    id:       'light',
    label:    'Light',
    desc:     'Clean cream background',
    swatches: ['#f9f5f0', '#ffffff', '#e8ddd0', '#2c1f14'],
  },
  {
    id:       'dark',
    label:    'Dark',
    desc:     'Deep espresso night mode',
    swatches: ['#211a13', '#2c241b', '#423627', '#e2a53b'],
  },
  {
    id:       'warm',
    label:    'Warm',
    desc:     'Rich warm browns',
    swatches: ['#3d2918', '#6a4b2f', '#5c4128', '#e2a53b'],
  },
];

export default function ThemePicker() {
  const { theme, setTheme } = useSettingsStore();

  return (
    <div className="grid grid-cols-3 gap-3">
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => setTheme(opt.id)}
          aria-pressed={theme === opt.id}
          className={cn(
            'relative text-left p-4 rounded-xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted',
            theme === opt.id
              ? 'border-accent bg-accent/5'
              : 'border-line hover:border-stone-300 dark:hover:border-line'
          )}
        >
          {theme === opt.id && (
            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
              <Check size={11} className="text-accent-ink" />
            </span>
          )}
          <div className="flex gap-1 mb-3">
            {opt.swatches.map((c, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-md border border-black/10"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-ink">{opt.label}</p>
          <p className="text-xs text-muted mt-0.5">{opt.desc}</p>
        </button>
      ))}
    </div>
  );
}
