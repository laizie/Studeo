// Shared input-validation helpers. Pure — no Electron/Node imports — so the IPC
// handlers in main and any future platform can enforce the same rules.
//
// Why this exists: main is the trust boundary. The renderer is treated as untrusted
// UI (see CLAUDE.md), so "the dropdown can only produce valid values" is not a
// guarantee main is allowed to rely on. The realistic path to a bad row isn't an
// attacker anyway — it's the ICS importer, the syllabus parser, or a future
// migration writing something the enum never anticipated.

/**
 * Throw unless `value` is one of `allowed`. Narrows the type on the way through, so
 * callers get a properly typed value rather than a cast.
 *
 * `label` names the field in the error, because these messages surface to the user
 * through the renderer's error toasts.
 */
export function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
  }
}

/**
 * Same, but tolerates the field being absent. Optional fields on an update payload
 * mean "don't change this", which is different from "set it to something invalid".
 */
export function assertOptionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): void {
  if (value === undefined) return;
  assertOneOf(value, allowed, label);
}

// A course color is stored as a hex string and used directly as a CSS color. We check
// the shape rather than membership of the palette: the palette lives in the renderer's
// token file, and pinning main to it would couple the two layers for little gain.
// Shape alone is enough to guarantee the DB can never hold something that renders as
// a broken swatch.
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function assertHexColor(value: unknown, label = 'color'): void {
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    throw new Error(`${label} must be a hex color like #6393e1`);
  }
}
