import { useState } from 'react';
import { Sun, Keyboard, Timer, Layers, ListTodo, GraduationCap, Trash2, Plus, Music, Check, Bell } from 'lucide-react';
import { useSettingsStore, type Theme } from '../../store/useSettingsStore';
import type { Term } from '../../../shared/types';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useTimerStore, FOCUS_OPTIONS, BREAK_OPTIONS, LONG_BREAK_OPTIONS } from '../../store/useTimerStore';
import { useTerms, useCreateTerm, useDeleteTerm } from '../../lib/queries/useTerms';
import { useSpotifyStatus } from '../../lib/queries/useSpotify';
import { useAppleMusicStatus } from '../../lib/queries/useAppleMusic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseDateLocal } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';

// Semester ranges span months and often years — show "Aug 18, 2026", never raw ISO.
function formatTermDate(dateStr: string): string {
  return parseDateLocal(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Shared sub-components ─────────────────────────────────────────────────────


function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm divide-y divide-line">
      {children}
    </div>
  );
}

function SettingsRow({ icon, label, description, children }: {
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
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

// ── Tip card ──────────────────────────────────────────────────────────────────

function TipCard({ icon, title, children }: {
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

// ── Music settings ────────────────────────────────────────────────────────────

function MusicServiceCard({
  label, accentColor, statusLine,
  isDefault, onSetDefault,
  action,
}: {
  label:       string;
  accentColor: string;
  statusLine:  string;
  isDefault:   boolean;
  onSetDefault: () => void;
  action?:     React.ReactNode;
}) {
  return (
    <div className={cn(
      'flex items-center justify-between px-5 py-4 transition-colors',
    )}>
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accentColor}22` }}
        >
          <Music size={14} style={{ color: accentColor }} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink-soft">{label}</p>
          <p className="text-xs text-muted mt-0.5">{statusLine}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {action}
        <button
          onClick={onSetDefault}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isDefault
              ? 'bg-accent text-accent-ink'
              : 'border border-line text-stone-600 dark:text-muted hover:bg-surface-hi'
          )}
        >
          {isDefault && <Check size={11} />}
          {isDefault ? 'Default' : 'Set as default'}
        </button>
      </div>
    </div>
  );
}

function MusicSection() {
  const { defaultMusicService, setDefaultMusicService } = useSettingsStore();
  const { data: spotifyStatus } = useSpotifyStatus();
  const { data: amStatus }      = useAppleMusicStatus();
  const qc = useQueryClient();

  const disconnectSpotify = useMutation({
    mutationFn: () => window.api.spotify.disconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spotify'] });
      if (defaultMusicService === 'spotify') setDefaultMusicService(null);
    },
  });

  const spotifyStatusLine = spotifyStatus?.connected
    ? `Connected as ${spotifyStatus.displayName}`
    : 'Not connected — click Connect Spotify in the sidebar';

  const amStatusLine = amStatus?.running
    ? 'Music app is open and ready'
    : 'Open the Music app to enable controls';

  return (
    <div className="mb-8">
      <SectionHeading>Music</SectionHeading>
      <p className="text-xs text-muted mb-3 -mt-1">
        Choose which service shows in the sidebar and Study page. You can connect both and switch here anytime.
      </p>
      <SettingsCard>
        <MusicServiceCard
          label="Spotify"
          accentColor="#1DB954"
          statusLine={spotifyStatusLine}
          isDefault={defaultMusicService === 'spotify'}
          onSetDefault={() => setDefaultMusicService('spotify')}
          action={spotifyStatus?.connected ? (
            <button
              onClick={() => disconnectSpotify.mutate()}
              disabled={disconnectSpotify.isPending}
              className="px-3 py-1.5 text-xs rounded-lg border border-line text-muted hover:border-red-300 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : undefined}
        />
        <MusicServiceCard
          label="Apple Music"
          accentColor="#fc3c44"
          statusLine={amStatusLine}
          isDefault={defaultMusicService === 'apple_music'}
          onSetDefault={() => setDefaultMusicService('apple_music')}
        />
      </SettingsCard>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ThemePicker() {
  const { theme, setTheme } = useSettingsStore();

  const options: { id: Theme; label: string; desc: string; swatches: string[] }[] = [
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

  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map(opt => (
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

const REMINDER_LEAD_OPTIONS = [5, 10, 15, 30] as const;

export default function SettingsPage() {
  const { focusSecs, breakSecs, longBreakSecs, setFocusMins, setBreakMins, setLongBreakMins } = useTimerStore();
  const {
    classRemindersEnabled, setClassRemindersEnabled,
    reminderLeadMinutes, setReminderLeadMinutes,
    dueDigestEnabled, setDueDigestEnabled,
    dueDigestTime, setDueDigestTime,
  } = useSettingsStore();

  const focusMins     = focusSecs / 60;
  const breakMins     = breakSecs / 60;
  const longBreakMins = longBreakSecs / 60;

  const { data: terms = [] } = useTerms();
  const createTerm = useCreateTerm();
  const deleteTerm = useDeleteTerm();

  const [newTermName,  setNewTermName]  = useState('');
  const [newTermStart, setNewTermStart] = useState('');
  const [newTermEnd,   setNewTermEnd]   = useState('');
  const [deletingTerm, setDeletingTerm] = useState<Term | null>(null);

  // ISO date strings compare correctly as plain strings.
  const termDatesInvalid = !!newTermStart && !!newTermEnd && newTermEnd < newTermStart;

  async function handleAddTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!newTermName.trim() || termDatesInvalid) return;
    try {
      await createTerm.mutateAsync({
        name:      newTermName.trim(),
        startDate: newTermStart || undefined,
        endDate:   newTermEnd   || undefined,
      });
    } catch {
      return; // keep the user's input; createTerm.isError renders the message
    }
    setNewTermName('');
    setNewTermStart('');
    setNewTermEnd('');
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink mb-1">Settings</h1>
      <p className="text-sm text-muted mb-8">Preferences for Studeo</p>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Appearance</SectionHeading>
        <SettingsCard>
          <SettingsRow icon={<Sun size={17} />} label="Theme" description="Choose your preferred color theme" />
          <div className="px-5 pb-4">
            <ThemePicker />
          </div>
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
          <SettingsRow
            icon={<Timer size={17} />}
            label="Long break duration"
            description="Every 4th focus session earns a long break"
          >
            <PillGroup
              options={LONG_BREAK_OPTIONS}
              value={longBreakMins}
              onChange={setLongBreakMins}
              suffix=" min"
            />
          </SettingsRow>
        </SettingsCard>
      </div>

      {/* ── Reminders ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Reminders</SectionHeading>
        <SettingsCard>
          <SettingsRow
            icon={<Bell size={17} />}
            label="Remind me before class"
            description="Desktop notification before each scheduled class time"
          >
            <Toggle checked={classRemindersEnabled} onChange={setClassRemindersEnabled} />
          </SettingsRow>
          {classRemindersEnabled && (
            <SettingsRow
              icon={<Timer size={17} />}
              label="Lead time"
              description="How early the reminder fires"
            >
              <PillGroup
                options={REMINDER_LEAD_OPTIONS}
                value={reminderLeadMinutes}
                onChange={setReminderLeadMinutes}
                suffix=" min"
              />
            </SettingsRow>
          )}
          <SettingsRow
            icon={<Bell size={17} />}
            label="Daily due-date digest"
            description="One notification listing what's due today and tomorrow"
          >
            <Toggle checked={dueDigestEnabled} onChange={setDueDigestEnabled} />
          </SettingsRow>
          {dueDigestEnabled && (
            <SettingsRow
              icon={<Timer size={17} />}
              label="Digest time"
              description="When the daily digest arrives"
            >
              <input
                type="time"
                value={dueDigestTime}
                onChange={e => setDueDigestTime(e.target.value)}
                aria-label="Daily digest time"
                className="px-3 py-1.5 text-sm border border-line rounded-lg bg-transparent dark:bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted"
              />
            </SettingsRow>
          )}
        </SettingsCard>
      </div>

      {/* ── Semesters ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Semesters</SectionHeading>
        <SettingsCard>
          {/* Existing terms */}
          {terms.length === 0 && (
            <div className="px-5 py-4 text-sm text-muted">
              No semesters yet. Add one below.
            </div>
          )}
          {terms.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink-soft">{t.name}</p>
                {(t.start_date || t.end_date) && (
                  <p className="text-xs text-muted mt-0.5">
                    {t.start_date && t.end_date
                      ? `${formatTermDate(t.start_date)} – ${formatTermDate(t.end_date)}`
                      : t.start_date
                        ? `From ${formatTermDate(t.start_date)}`
                        : `Until ${formatTermDate(t.end_date!)}`}
                  </p>
                )}
              </div>
              <button
                onClick={() => setDeletingTerm(t)}
                aria-label={`Delete semester ${t.name}`}
                className="ml-4 p-1.5 text-muted hover:text-red-500 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                title="Delete semester"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Add term form */}
          <form onSubmit={handleAddTerm} className="px-5 py-4 border-t border-line">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Add semester
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={newTermName}
                onChange={e => setNewTermName(e.target.value)}
                placeholder="e.g. Fall 2026"
                aria-label="Semester name"
                className="w-full px-3 py-1.5 text-sm border border-line rounded-lg bg-transparent dark:bg-inset text-ink placeholder:text-stone-500 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted"
              />
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="block text-xs text-muted mb-1">Starts (optional)</span>
                  <input
                    type="date"
                    value={newTermStart}
                    onChange={e => setNewTermStart(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-line rounded-lg bg-transparent dark:bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted"
                  />
                </label>
                <label className="flex-1">
                  <span className="block text-xs text-muted mb-1">Ends (optional)</span>
                  <input
                    type="date"
                    value={newTermEnd}
                    onChange={e => setNewTermEnd(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-line rounded-lg bg-transparent dark:bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-muted"
                  />
                </label>
              </div>
              {termDatesInvalid && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  The end date is before the start date.
                </p>
              )}
              {createTerm.isError && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  Something went wrong — your semester wasn't saved. Please try again.
                </p>
              )}
              <button
                type="submit"
                disabled={!newTermName.trim() || termDatesInvalid || createTerm.isPending}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={13} />
                {createTerm.isPending ? 'Adding…' : 'Add semester'}
              </button>
            </div>
          </form>
        </SettingsCard>
      </div>

      {/* ── Music ─────────────────────────────────────────────────────────── */}
      <MusicSection />

      {/* ── How to use ────────────────────────────────────────────────────── */}
      <div>
        <SectionHeading>How to use Studeo efficiently</SectionHeading>
        <SettingsCard>
          <TipCard icon={<Keyboard size={16} />} title="Quick Add — ⌘N (or Ctrl+N on Windows)">
            Press this shortcut from any screen to instantly add an assignment or task without
            leaving what you're doing. The dialog remembers which tab (Assignment vs Task) you
            last used.
          </TipCard>
          <TipCard icon={<Layers size={16} />} title="Enter a whole semester in minutes">
            On any course's detail page, click <strong>Batch add</strong>. Paste your syllabus
            text to extract names, types, and due dates automatically — or type one row like
            "Homework 1" and use the <strong>repeat</strong> button to generate the weekly
            series through the end of the term.
          </TipCard>
          <TipCard icon={<GraduationCap size={16} />} title="Track your grade as scores come back">
            Edit an assignment to record what you earned ("18 out of 20"), and set per-type
            weights in the <strong>Grade weights</strong> card on the course page. Your current
            standing shows on the course card and header. Big assignment? Use the checklist
            icon on its row to break it into steps.
          </TipCard>
          <TipCard icon={<ListTodo size={16} />} title="Build a Focus List for your session">
            On the Study page, click <strong>Add</strong> next to "Today's Focus List" to pick
            assignments and tasks you want to tackle that session. Check them off as you go —
            checking an item marks it complete across the whole app, so your progress stays
            in sync everywhere.
          </TipCard>
        </SettingsCard>
      </div>

      <ConfirmDialog
        isOpen={deletingTerm !== null}
        title={`Delete "${deletingTerm?.name}"?`}
        message="Courses assigned to it are kept — they just lose their semester grouping."
        onConfirm={() => { if (deletingTerm) deleteTerm.mutate(deletingTerm.id); }}
        onClose={() => setDeletingTerm(null)}
      />
    </div>
  );
}
