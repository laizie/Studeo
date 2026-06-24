// Quick-pick playlists for Focus Mode's music rail. Apple Music can't expose its queue,
// so instead of an "Up next" list (like Spotify) we offer the user's playlists to start
// one in a single tap — keeping the rail useful rather than empty.

import { ListMusic, Play } from 'lucide-react';
import { useAppleMusicPlaylists, useAppleMusicPlayPlaylist } from '../../lib/queries/useAppleMusic';

export default function AppleMusicPlaylistsList({ max = 12 }: { max?: number }) {
  const { data: playlists = [] } = useAppleMusicPlaylists();
  const playPlaylist = useAppleMusicPlayPlaylist();
  if (playlists.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#c4a882]">
        Your playlists
      </p>
      <div>
        {playlists.slice(0, max).map(pl => (
          <button
            key={pl.id}
            onClick={() => playPlaylist.mutate(pl.id)}
            disabled={playPlaylist.isPending}
            className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-white/10">
              {pl.artworkUrl
                ? <img src={pl.artworkUrl} alt="" className="h-full w-full object-cover" />
                : <ListMusic size={11} className="text-[#fc3c44]" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs leading-tight text-[#e8d5c0]">{pl.name}</p>
              <p className="mt-0.5 truncate text-[10px] leading-tight text-[#c4a882]">{pl.trackCount} tracks</p>
            </div>
            <Play size={11} fill="currentColor" className="shrink-0 text-[#fc3c44] opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}
