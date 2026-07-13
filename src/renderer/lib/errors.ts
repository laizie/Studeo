/**
 * Turn a failed mutation's error into something worth reading.
 *
 * IPC rejections arrive wrapped by Electron as
 *   "Error invoking remote method 'courses:create': Error: Course name is required"
 * — the useful part is the tail our main-process validation actually threw.
 * Returns the cleaned reason, or null when there's nothing human to show
 * (callers fall back to their own "Something went wrong" line).
 */
export function errorReason(error: unknown): string | null {
  const raw =
    error instanceof Error ? error.message :
    typeof error === 'string' ? error : '';
  const match = raw.match(/Error invoking remote method '[^']+': (?:Error: )?([\s\S]*)$/);
  const reason = (match ? match[1] : raw).trim();
  return reason.length > 0 ? reason : null;
}
