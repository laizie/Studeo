// Which themes the app ships, and which of them paint a dark room.
//
// In shared/ rather than the store because it is pure fact about the design
// system with no Electron or DOM in it, and because three very different things
// need it and must not disagree:
//
//   1. applyTheme()  — puts `.dark` on <html> so every `dark:` utility resolves.
//   2. NoteEditor    — hands BlockNote a color scheme for its own stylesheet.
//   3. themeTokens.test.ts — cross-checks this against the actual token values.
//
// It was duplicated instead, as `theme === 'light' ? … : 'dark'` in the note
// editor, which silently meant "light is the only light theme". That held while
// the only other themes were dark and warm, and broke the moment two more
// LIGHT-family themes existed: blush and linen were handed BlockNote's dark
// scheme, which sets --bn-colors-editor-text to #cfcfcf — pale gray note text
// on pale pink paper. Adding a theme should not require remembering this file;
// the test below makes forgetting it a failure.

export const THEMES = ['light', 'dark', 'warm', 'blush', 'linen'] as const;

export type Theme = typeof THEMES[number];

/**
 * Themes with pale ink on deep surfaces. Everything else is light-family.
 *
 * Membership is a property of the token values, not a preference: a theme
 * belongs here if and only if its `--ink` is lighter than its `--bg`. That is
 * asserted against src/index.css in themeTokens.test.ts, so this list cannot
 * drift away from the colors it describes.
 */
const DARK_FAMILY: readonly Theme[] = ['dark', 'warm'];

export function isDarkTheme(theme: Theme): boolean {
  return DARK_FAMILY.includes(theme);
}
