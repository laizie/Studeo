// The "Up next" queue, shown under the now-playing card in Focus Mode's music rail.
// Read-only: Spotify's API doesn't allow reordering, so these are just a peek ahead.

import { Music } from 'lucide-react';
import { useSpotifyQueue } from '../../lib/queries/useSpotify';

export default function SpotifyUpNext({ max = 10 }: { max?: number }) {
  const { data: queue } = useSpotifyQueue();
  if (!queue || queue.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#c4a882]">
        Up next
      </p>
      <div>
        {queue.slice(0, max).map((track, i) => (
          <div key={`${track.id}-${i}`} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 hover:bg-white/[0.04] transition-colors">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-[#1DB954]/15">
              {track.albumArt
                ? <img src={track.albumArt} alt="" className="h-full w-full object-cover" />
                : <Music size={11} className="text-[#1DB954]" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs leading-tight text-[#e8d5c0]">{track.name}</p>
              <p className="mt-0.5 truncate text-[10px] leading-tight text-[#c4a882]">{track.artists.join(', ')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
