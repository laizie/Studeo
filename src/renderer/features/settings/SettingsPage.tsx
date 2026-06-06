import { useState } from 'react';
import { Sun, Keyboard, BookOpen, Timer, Layers, ListTodo, Brain, GraduationCap, Trash2, Plus, Music, Check } from 'lucide-react';
import { useSettingsStore, type MusicService, type Theme } from '../../store/useSettingsStore';
import { useTimerStore, FOCUS_OPTIONS, BREAK_OPTIONS } from '../../store/useTimerStore';
import { useTerms, useCreateTerm, useDeleteTerm } from '../../lib/queries/useTerms';
import { useSpotifyStatus } from '../../lib/queries/useSpotify';
import { useAppleMusicStatus } from '../../lib/queries/useAppleMusic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '../../lib/utils';

// ── Shared sub-components ─────────────────────────────────────────────────────


function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-stone-400 dark:text-[#e0b870] uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] rounded-xl shadow-sm divide-y divide-[#e8ddd0] dark:divide-[#442918] warm:divide-[#6e4c30]">
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
              : 'bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48] text-stone-500 dark:text-[#c4a882] hover:bg-stone-200 dark:hover:bg-[#775544] warm:hover:bg-[#9e7860]'
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

// ── Music settings ────────────────────────────────────────────────────────────

function MusicServiceCard({
  service, label, accentColor, statusLine,
  isDefault, onSetDefault,
  action,
}: {
  service:     MusicService;
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
          <p className="text-sm font-medium text-stone-700 dark:text-[#e8d5c0]">{label}</p>
          <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">{statusLine}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {action}
        <button
          onClick={onSetDefault}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isDefault
              ? 'bg-[#e2a53b] text-[#1e1208]'
              : 'border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] text-stone-600 dark:text-[#c4a882] hover:bg-stone-50 dark:hover:bg-[#442918] warm:hover:bg-[#6e4c30]'
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
      <p className="text-xs text-stone-400 dark:text-[#c4a882] mb-3 -mt-1">
        Choose which service shows in the sidebar and Study page. You can connect both and switch here anytime.
      </p>
      <SettingsCard>
        <MusicServiceCard
          service="spotify"
          label="Spotify"
          accentColor="#1DB954"
          statusLine={spotifyStatusLine}
          isDefault={defaultMusicService === 'spotify'}
          onSetDefault={() => setDefaultMusicService('spotify')}
          action={spotifyStatus?.connected ? (
            <button
              onClick={() => disconnectSpotify.mutate()}
              disabled={disconnectSpotify.isPending}
              className="px-3 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] text-stone-500 dark:text-[#c4a882] hover:border-red-300 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : undefined}
        />
        <MusicServiceCard
          service="apple_music"
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
      id:       'warm',
      label:    'Warm',
      desc:     'Rich warm browns',
      swatches: ['#5c3c22', '#7e5a38', '#8e6a48', '#2c1f14'],
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => setTheme(opt.id)}
          className={cn(
            'relative text-left p-4 rounded-xl border-2 transition-all',
            theme === opt.id
              ? 'border-[#e2a53b] bg-[#e2a53b]/5'
              : 'border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] hover:border-stone-300 dark:hover:border-[#664433] warm:hover:border-[#8e6a48]'
          )}
        >
          {theme === opt.id && (
            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#e2a53b] flex items-center justify-center">
              <Check size={11} className="text-white" />
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
          <p className="text-sm font-semibold text-stone-800 dark:text-[#f0e0cc]">{opt.label}</p>
          <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">{opt.desc}</p>
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { } = useSettingsStore();
  const { focusSecs, breakSecs, setFocusMins, setBreakMins } = useTimerStore();

  const focusMins = focusSecs / 60;
  const breakMins = breakSecs / 60;

  const { data: terms = [] } = useTerms();
  const createTerm = useCreateTerm();
  const deleteTerm = useDeleteTerm();

  const [newTermName,  setNewTermName]  = useState('');
  const [newTermStart, setNewTermStart] = useState('');
  const [newTermEnd,   setNewTermEnd]   = useState('');

  async function handleAddTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!newTermName.trim()) return;
    await createTerm.mutateAsync({
      name:      newTermName.trim(),
      startDate: newTermStart || undefined,
      endDate:   newTermEnd   || undefined,
    });
    setNewTermName('');
    setNewTermStart('');
    setNewTermEnd('');
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc] mb-1">Settings</h1>
      <p className="text-sm text-stone-400 dark:text-[#e0b870] mb-8">Preferences for ClassTrack</p>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Appearance</SectionHeading>
        <SettingsCard>
          <SettingsRow icon={<Sun size={17} />} label="Theme" description="Choose your preferred color theme">
            <span />
          </SettingsRow>
          <div className="px-4 pb-4">
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
        </SettingsCard>
      </div>

      {/* ── Semesters ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeading>Semesters</SectionHeading>
        <SettingsCard>
          {/* Existing terms */}
          {terms.length === 0 && (
            <div className="px-5 py-4 text-sm text-stone-400 dark:text-[#c4a882]">
              No semesters yet. Add one below.
            </div>
          )}
          {terms.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-[#e8d5c0]">{t.name}</p>
                {(t.start_date || t.end_date) && (
                  <p className="text-xs text-stone-400 dark:text-[#c4a882] mt-0.5">
                    {t.start_date ?? '?'} → {t.end_date ?? '?'}
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteTerm.mutate(t.id)}
                className="ml-4 p-1.5 text-stone-300 dark:text-[#775544] hover:text-red-400 transition-colors rounded"
                title="Delete semester"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Add term form */}
          <form onSubmit={handleAddTerm} className="px-5 py-4 border-t border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30]">
            <p className="text-xs font-semibold text-stone-400 dark:text-[#c4a882] uppercase tracking-wide mb-3">
              Add semester
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={newTermName}
                onChange={e => setNewTermName(e.target.value)}
                placeholder="e.g. Fall 2026"
                className="w-full px-3 py-1.5 text-sm border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] rounded-lg bg-transparent dark:bg-[#332211] warm:bg-[#3d2918] text-stone-700 dark:text-[#f0e0cc] placeholder:text-stone-300 dark:placeholder:text-[#cc9a58] focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-[#664433]"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newTermStart}
                  onChange={e => setNewTermStart(e.target.value)}
                  title="Start date (optional)"
                  className="flex-1 px-3 py-1.5 text-sm border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] rounded-lg bg-transparent dark:bg-[#332211] warm:bg-[#3d2918] text-stone-700 dark:text-[#f0e0cc] focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-[#664433]"
                />
                <input
                  type="date"
                  value={newTermEnd}
                  onChange={e => setNewTermEnd(e.target.value)}
                  title="End date (optional)"
                  className="flex-1 px-3 py-1.5 text-sm border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] rounded-lg bg-transparent dark:bg-[#332211] warm:bg-[#3d2918] text-stone-700 dark:text-[#f0e0cc] focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-[#664433]"
                />
              </div>
              <button
                type="submit"
                disabled={!newTermName.trim() || createTerm.isPending}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={13} />
                Add semester
              </button>
            </div>
          </form>
        </SettingsCard>
      </div>

      {/* ── Music ─────────────────────────────────────────────────────────── */}
      <MusicSection />

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
          <TipCard icon={<GraduationCap size={16} />} title="Organise courses by semester">
            Create semesters in the <strong>Semesters</strong> section above, then assign each course to one when creating it.
            The Dashboard and Courses pages will auto-select the current semester (matched by date) and only show relevant courses.
            Switch to <strong>All</strong> any time to see every course across all semesters.
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
