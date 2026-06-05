import { Moon, Sun, Keyboard, BookOpen, Timer, Layers, ListTodo, Brain } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTimerStore, FOCUS_OPTIONS, BREAK_OPTIONS } from '../../store/useTimerStore';
import { cn } from '../../lib/utils';

// ── Shared sub-components ─────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-[#e2a53b]' : 'bg-stone-300 dark:bg-[#775544]',
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-stone-400 dark:text-[#e0b870] uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#553311] border border-[#e8ddd0] dark:border-[#442918] rounded-xl shadow-sm divide-y divide-[#e8ddd0] dark:divide-[#442918]">
      {children}
    </div>
  );
}

function SettingsRow({ icon, label, description, children }: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="text-stone-400 dark:text-[#c4a882] shrink-0">{icon}</span>
        <div>
          <p className="text-sm font-medium text-stone-700 dark:text-[#e8d5c0]">{label}</p>
          {description && (
            <p className="text-xs text-stone-400 dark:text-[#e0b870] mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4">{children}</div>
    </div>
  );
}

function PillGroup<T extends number>({
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
    <div className="flex gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'px-3 py-1 text-sm rounded-md transition-colors',
            value === opt
              ? 'bg-[#e2a53b] text-[#1e1208] font-medium'
              : 'bg-stone-100 dark:bg-[#664433] text-stone-500 dark:text-[#c4a882] hover:bg-stone-200 dark:hover:bg-[#775544]'
          )}
        >
          {opt}{suffix}
        </button>
      ))}
    </div>
  );
}

// ── Tip card ──────────────────────────────────────────────────────────────────

function TipCard({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      <span className="text-[#e2a53b] shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-medium text-stone-700 dark:text-[#e8d5c0]">{title}</p>
        <p className="text-xs text-stone-500 dark:text-[#e0b870] mt-1 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { darkMode, toggleDarkMode } = useSettingsStore();
  const { focusSecs, breakSecs, setFocusMins, setBreakMins } = useTimerStore();

  const focusMins = focusSecs / 60;
  const breakMins = breakSecs / 60;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc] mb-1">Settings</h1>
      <p className="text-sm text-stone-400 dark:text-[#e0b870] mb-8">Preferences for ClassTrack</p>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Appearance</SectionHeading>
        <SettingsCard>
          <SettingsRow
            icon={darkMode ? <Moon size={17} /> : <Sun size={17} />}
            label="Dark mode"
            description={darkMode ? 'On — warm brown theme' : 'Off — light cream theme'}
          >
            <ToggleSwitch checked={darkMode} onChange={toggleDarkMode} />
          </SettingsRow>
        </SettingsCard>
      </div>

      {/* ── Study / Pomodoro ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Study timer</SectionHeading>
        <SettingsCard>
          <SettingsRow
            icon={<Timer size={17} />}
            label="Focus duration"
            description="Default length of a focus session"
          >
            <PillGroup
              options={FOCUS_OPTIONS}
              value={focusMins}
              onChange={setFocusMins}
              suffix=" min"
            />
          </SettingsRow>
          <SettingsRow
            icon={<Timer size={17} />}
            label="Break duration"
            description="Default length of a break"
          >
            <PillGroup
              options={BREAK_OPTIONS}
              value={breakMins}
              onChange={setBreakMins}
              suffix=" min"
            />
          </SettingsRow>
        </SettingsCard>
      </div>

      {/* ── How to use ────────────────────────────────────────────────────── */}
      <div>
        <SectionHeading>How to use ClassTrack efficiently</SectionHeading>
        <SettingsCard>
          <TipCard icon={<Keyboard size={16} />} title="Quick Add — ⌘N (or Ctrl+N on Windows)">
            Press this shortcut from any screen to instantly add an assignment or task without
            leaving what you're doing. The dialog remembers which tab (Assignment vs Task) you
            last used.
          </TipCard>
          <TipCard icon={<Layers size={16} />} title="Batch import from your syllabus">
            On any course's detail page, click <strong>Batch add</strong> next to the Add button.
            Paste your full syllabus text — ClassTrack will extract assignment names, types, and
            due dates automatically. Review and edit in the grid before saving.
          </TipCard>
          <TipCard icon={<BookOpen size={16} />} title="Mark progress with one click">
            Click the circle icon on the left of any assignment or task row to cycle through
            Not started → In progress → Done. Completed items fade and are hidden by default
            to keep your lists clean.
          </TipCard>
          <TipCard icon={<Timer size={16} />} title="Study with the Pomodoro timer">
            Head to Study, pick a focus length, and start. Paste a Spotify or Apple Music
            playlist URL to have music alongside your timer. When a session ends you'll get
            a desktop notification — make sure to allow notifications when prompted.
          </TipCard>
          <TipCard icon={<Brain size={16} />} title="Try different study techniques">
            The Technique selector on the Study page offers three research-backed methods:
            <strong> Pomodoro</strong> (25/5 — great for everyday tasks),
            <strong> 52/17</strong> (longer deep focus — ideal for complex problems), and
            <strong> Deep Work</strong> (90/20 — full ultradian rhythm blocks for serious study).
            Switch to <strong>Custom</strong> to set your own durations.
          </TipCard>
          <TipCard icon={<ListTodo size={16} />} title="Build a Focus List for your session">
            On the Study page, click <strong>Add</strong> next to "Today's Focus List" to pick
            assignments and tasks you want to tackle that session. Check them off as you go —
            checking an item marks it complete across the whole app, so your progress stays
            in sync everywhere.
          </TipCard>
        </SettingsCard>
      </div>
    </div>
  );
}
