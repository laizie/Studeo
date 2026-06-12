import { cn } from '../../lib/utils';

// Shared building blocks for the Settings page. Every section file composes
// these so the whole page keeps one visual vocabulary: an uppercase heading,
// a bordered card, and label-left / control-right rows divided by hairlines.

/** One standard input style for every text/date/time field on Settings. */
export const SETTINGS_INPUT =
  'px-3 py-1.5 text-sm border border-line rounded-lg bg-transparent dark:bg-inset text-ink ' +
  'placeholder:text-stone-500 dark:placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted';

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm divide-y divide-line">
      {children}
    </div>
  );
}

export function SettingsRow({ icon, label, description, children }: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="text-muted shrink-0">{icon}</span>
        <div>
          <p className="text-sm font-medium text-ink-soft">{label}</p>
          {description && (
            <p className="text-xs text-muted mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="shrink-0 ml-4">{children}</div>}
    </div>
  );
}

export function PillGroup<T extends number>({
  options,
  value,
  onChange,
  suffix,
}: {
  options: readonly T[];
  value: number;
  onChange: (v: T) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-1 bg-inset rounded-lg w-fit">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={cn(
            'px-3 py-1 text-sm rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted',
            value === opt
              ? 'bg-surface text-ink shadow-sm font-medium'
              : 'text-ink-soft hover:bg-surface-hi'
          )}
        >
          {opt}{suffix}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400',
        // Off track must contrast with the card it sits on — bg-surface here
        // would vanish against the bg-surface card in dark/warm themes.
        checked ? 'bg-accent' : 'bg-stone-300 dark:bg-inset'
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      )} />
    </button>
  );
}

/** Small bordered action button used for one-off actions inside cards. */
export function CardButton({ onClick, disabled, children }: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-line text-stone-600 dark:text-muted hover:bg-surface-hi transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted"
    >
      {children}
    </button>
  );
}

export function TipCard({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      <span className="text-accent shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-medium text-ink-soft">{title}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
