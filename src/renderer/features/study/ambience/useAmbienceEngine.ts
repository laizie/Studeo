import { useEffect } from 'react';
import { useAmbienceStore } from '../../../store/useAmbienceStore';
import { ambienceEngine } from './ambienceEngine';

/**
 * Drive the Web Audio ambience engine from the store, app-wide.
 *
 * This used to be two effects inside FocusMode. They ran app-wide even so — Layout
 * mounts FocusMode always and it early-returns null when the room is closed — so the
 * audio was driven from a component that was only incidentally always there. Now that
 * the Study page has the same controls, that arrangement is a trap: the day FocusMode
 * becomes conditionally rendered (or lazy-loaded, like the note editor), ambience would
 * silently stop following the store. It belongs in the shell, beside useTimerDriver,
 * for the same reason that does: what it controls outlives any one screen.
 *
 * Mount once. The store's selection starts null every launch, so this plays nothing
 * until the user picks a texture — no startling autoplay on open.
 */
export function useAmbienceEngine(): void {
  const activeId = useAmbienceStore(s => s.activeId);
  const volume   = useAmbienceStore(s => s.volume);

  // Volume first, so the engine knows the target level before a play ramps up to it.
  useEffect(() => { ambienceEngine.setVolume(volume); }, [volume]);

  useEffect(() => {
    if (activeId) ambienceEngine.play(activeId);
    else ambienceEngine.stop();
  }, [activeId]);
}
