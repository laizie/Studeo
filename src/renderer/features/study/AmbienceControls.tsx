import { Volume2 } from 'lucide-react';
import { AMBIENCE_SOUNDS } from '../../../shared/ambience';
import { useAmbienceStore } from '../../store/useAmbienceStore';
import { ROOM, GLOW } from './roomPalette';
import { cn } from '../../lib/utils';

/**
 * Bundled ambient sound: rain, beach, wind, brown noise. Pick a texture to start it,
 * pick it again to stop. Nothing is streamed or downloaded — the audio is synthesized
 * in the browser (see shared/ambience.ts), so it works offline and needs no service.
 *
 * `tone` is the same idea as AutoNowPlaying's: one component, two skins.
 *   'room'    — Focus Mode's fixed warm-dark palette, which ignores the app theme.
 *   'surface' — an ordinary card on the Study page, following the theme tokens.
 * The behaviour is identical in both because it's the same store underneath: start
 * rain on the Study page, enter Focus Mode, and it's already playing there.
 *
 * The audio engine is NOT driven from here. It follows the store app-wide (see
 * ambience/useAmbienceEngine.ts, mounted in Layout) — otherwise the sound would stop
 * the moment whichever surface started it unmounted.
 */
export default function AmbienceControls({ tone = 'surface' }: { tone?: 'room' | 'surface' }) {
  const activeId  = useAmbienceStore(s => s.activeId);
  const volume    = useAmbienceStore(s => s.volume);
  const toggle    = useAmbienceStore(s => s.toggle);
  const setVolume = useAmbienceStore(s => s.setVolume);

  const isRoom = tone === 'room';

  return (
    <div>
      <p
        className={cn(
          'mb-2 font-medium uppercase',
          isRoom ? 'px-3 text-caption tracking-wider' : 'text-xs tracking-wide text-muted',
        )}
        style={isRoom ? { color: ROOM.muted } : undefined}
      >
        Ambience
      </p>

      <div className={cn('flex flex-wrap gap-1.5', isRoom && 'px-1')}>
        {AMBIENCE_SOUNDS.map(s => {
          const active = activeId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              title={s.description}
              aria-pressed={active}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                !isRoom && (active
                  ? 'bg-accent border-accent text-accent-ink'
                  : 'border-line text-muted hover:bg-inset hover:text-ink-soft'),
              )}
              style={isRoom
                ? (active
                    ? { backgroundColor: GLOW.focus, borderColor: GLOW.focus, color: '#1e1208' }
                    : { borderColor: ROOM.line, color: ROOM.muted })
                : undefined}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* The volume slider only appears once something is playing — there's nothing
          to set the level of before that. */}
      {activeId && (
        <div className={cn('mt-3 flex items-center gap-2', isRoom && 'px-2')}>
          <Volume2
            size={14}
            className={cn('shrink-0', !isRoom && 'text-muted')}
            style={isRoom ? { color: ROOM.muted } : undefined}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            aria-label="Ambience volume"
            className={cn(
              'h-1 flex-1 cursor-pointer',
              !isRoom && 'accent-stone-600 dark:accent-[#e2a53b]',
            )}
            style={isRoom ? { accentColor: GLOW.focus } : undefined}
          />
        </div>
      )}
    </div>
  );
}
