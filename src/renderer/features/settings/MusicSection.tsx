import { useState } from 'react';
import { Music, Check, Minimize2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSpotifyStatus } from '../../lib/queries/useSpotify';
import { useAppleMusicStatus } from '../../lib/queries/useAppleMusic';
import SpotifySetupDialog from '../spotify/SpotifySetupDialog';
import { SectionHeading, SettingsCard, SettingsRow, Toggle } from './components';
import { cn } from '../../lib/utils';

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
    <div className="flex items-center justify-between px-5 py-4">
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
              : 'border border-line text-muted hover:bg-surface-hi'
          )}
        >
          {isDefault && <Check size={11} />}
          {isDefault ? 'Default' : 'Set as default'}
        </button>
      </div>
    </div>
  );
}

export default function MusicSection() {
  const { defaultMusicService, setDefaultMusicService, nowPlayingOnly, setNowPlayingOnly } = useSettingsStore();
  const { data: spotifyStatus } = useSpotifyStatus();
  const { data: amStatus }      = useAppleMusicStatus();
  const [setupOpen, setSetupOpen] = useState(false);
  const qc = useQueryClient();

  const disconnectSpotify = useMutation({
    mutationFn: () => window.api.spotify.disconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spotify'] });
      if (defaultMusicService === 'spotify') setDefaultMusicService(null);
    },
  });

  return (
    <div className="mb-8">
      <SectionHeading>Music</SectionHeading>
      <p className="text-xs text-muted mb-3 -mt-1">
        The default service appears in the sidebar and on the Study page.
      </p>
      <SettingsCard>
        <MusicServiceCard
          label="Spotify"
          accentColor="#1DB954"
          statusLine={spotifyStatus?.connected
            ? `Connected as ${spotifyStatus.displayName}`
            : 'Not connected'}
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
          ) : (
            <button
              onClick={() => setSetupOpen(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1DB954] text-white hover:bg-[#17a349] transition-colors"
            >
              Connect
            </button>
          )}
        />
        <MusicServiceCard
          label="Apple Music"
          accentColor="#fc3c44"
          statusLine={amStatus?.running
            ? 'Music app is open and ready'
            : 'Open the Music app to enable controls'}
          isDefault={defaultMusicService === 'apple_music'}
          onSetDefault={() => setDefaultMusicService('apple_music')}
        />
        <SettingsRow
          icon={<Minimize2 size={16} />}
          label="Now playing only"
          description="Hide playlists and search — show just the current track and controls."
        >
          <Toggle checked={nowPlayingOnly} onChange={setNowPlayingOnly} />
        </SettingsRow>
      </SettingsCard>
      <SpotifySetupDialog isOpen={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  );
}
