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
  {
    id:       'blush',
    label:    'Blush',
    desc:     'Soft rose daylight',
    // page · the palette midpoint that no token claims · hairline · accent.
    swatches: ['#ffe5ec', '#ffc2d1', '#ffb3c6', '#fb6f92'],
  },
];

export default function ThemePicker() {
  const { theme, setTheme } = useSettingsStore();

  return (
    // Two-up rather than one row: at four themes a single row inside the
    // max-w-2xl settings card squeezes each card narrower than its own swatch
    // strip. A 2×2 grid keeps every card readable and has room for a fifth.
    <div className="grid grid-cols-2 gap-3">
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => setTheme(opt.id)}
          aria-pressed={theme === opt.id}
          className={cn(
            'relative text-left p-4 rounded-xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted',
            theme === opt.id
              ? 'border-accent bg-accent/5'
              // Token, not stone-300: the hover edge has to follow the theme, or
              // picking Blush leaves a gray hover sitting in a pink card.
              : 'border-line hover:border-line-strong'
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
