import type { Phase } from '../../../shared/pomodoro';

// ── The room ────────────────────────────────────────────────────────────────────
// Focus Mode dims the lights regardless of the app theme: a fixed warm-dark palette
// so the experience is consistent and low-stim. Named here, not pulled from theme
// tokens (those flip bright in the light theme and would wash out on the dark room).
//
// In its own file because the room is no longer one component: AmbienceControls now
// renders both inside the room and on the Study page, and it needs these colors for
// the first without importing FocusMode (which imports it back).
export const ROOM = {
  ink:   '#f0e0cc', // hero text — warm cream
  soft:  '#d8c5ab', // intention echo, secondary
  muted: '#a08a6e', // meta, hints
  line:  '#3a2c1e', // hairlines, input wells
  well:  '#160f0a', // input background
  card:  '#1f1710', // reflection card
  done:  '#5fa37a', // success check — the room's on-dark green
} as const;

// The lamplight. Amber while you work (the brand "Lamplight Amber"); it cools to a
// calm green on breaks, so the room itself tells you which phase you're in.
export const GLOW: Record<Phase, string> = {
  focus:       '#e2a53b',
  short_break: '#5fa37a',
  long_break:  '#4f9270',
};
