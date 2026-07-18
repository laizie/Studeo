import { useState } from 'react';
import { Music, Check, Radio } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSpotifyStatus } from '../../lib/queries/useSpotify';
import { useAppleMusicStatus } from '../../lib/queries/useAppleMusic';
import SpotifySetupDialog from '../spotify/SpotifySetupDialog';
import { SectionHeading, SettingsCard } from './components';
import { cn } from '../../lib/utils';

// One selectable row: an icon chip, a label + status line, an optional side action
// (connect/disconnect), and the Select button that makes it the active music mode.
function MusicModeCard({
  label, accentColor, statusLine, icon,
  isSelected, onSelect, action,
}: {
  label:       string;
  accentColor: string;
  statusLine:  string;
  icon?:       React.ReactNode;
  isSelected:  boolean;
  onSelect:    () => void;
  action?:     React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accentColor}22` }}
        >
          {icon ?? <Music size={14} style={{ color: accentColor }} />}
        </div>
        <div>
          <p className="text-sm font-medium text-ink-soft">{label}</p>
          <p className="text-xs text-muted mt-0.5">{statusLine}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {action}
        <button
          onClick={onSelect}
          aria-pressed={isSelected}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isSelected
              ? 'bg-accent text-accent-ink'
              : 'border border-line text-muted hover:bg-surface-hi'
          )}
        >
          {isSelected && <Check size={11} />}
          {isSelected ? 'Selected' : 'Select'}
        </button>
      </div>
    </div>
  );
}

export default function MusicSection() {
  const { musicMode, setMusicMode } = useSettingsStore();
  const { data: spotifyStatus } = useSpotifyStatus();
  const { data: amStatus }      = useAppleMusicStatus();
  const [setupOpen, setSetupOpen] = useState(false);
  const qc = useQueryClient();

  const disconnectSpotify = useMutation({
    mutationFn: () => window.api.spotify.disconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spotify'] });
      if (musicMode === 'spotify') setMusicMode(null);
    },
  });

  return (
    <div className="mb-8">
      <SectionHeading>Music</SectionHeading>
      <p className="text-xs text-muted mb-3 -mt-1">
        Pick what shows in the sidebar, on the Study page, and in Focus Mode.
      </p>
      <SettingsCard>
        <MusicModeCard
          label="Spotify"
          accentColor="#1DB954"
          statusLine={spotifyStatus?.connected
            ? `Connected as ${spotifyStatus.displayName}`
            : 'Not connected'}
          isSelected={musicMode === 'spotify'}
          onSelect={() => setMusicMode('spotify')}
          action={spotifyStatus?.connected ? (
            <button
              onClick={() => disconnectSpotify.mutate()}
              disabled={disconnectSpotify.isPending}
              className="px-3 py-1.5 text-xs rounded-lg border border-line text-muted hover:border-red-300 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => setSetupOpen(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1DB954] text-white hover:bg-[#17a349] transition-colors"
            >
              Connect
            </button>
          )}
        />
        <MusicModeCard
          label="Apple Music"
          accentColor="#fc3c44"
          statusLine={amStatus?.running
            ? 'Music app is open and ready'
            : 'Open the Music app to enable controls'}
          isSelected={musicMode === 'apple_music'}
          onSelect={() => setMusicMode('apple_music')}
        />
        <MusicModeCard
          label="Now Playing"
          accentColor="#e2a53b"
          icon={<Radio size={14} style={{ color: '#e2a53b' }} />}
          statusLine="A minimal card that follows whatever's playing — Apple Music or Spotify"
          isSelected={musicMode === 'now_playing'}
          onSelect={() => setMusicMode('now_playing')}
        />
      </SettingsCard>
      <SpotifySetupDialog isOpen={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  );
}
