import { app, protocol } from 'electron';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

// Note images live as real files on disk under the app's data folder — never base64-inlined
// into the document JSON (that would bloat every note read). They're served back to the
// renderer through a custom `studeo-asset://` protocol rather than file:// — file:// is
// blocked/awkward under hardened webPreferences, and a scoped custom scheme lets us serve
// ONLY this directory (no path-traversal into the rest of the disk).

export const ASSET_SCHEME = 'studeo-asset';

// A note id is a UUID. We validate against this before touching the filesystem so a crafted
// id can't escape the assets root.
const UUID_RE = /^[0-9a-f-]{36}$/i;

// Whitelisted image extensions and their MIME types. Anything else is rejected on save.
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

function assetsRoot(): string {
  return path.join(app.getPath('userData'), 'note-assets');
}

function normalizeExt(ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase();
  return clean in MIME ? clean : '';
}

/**
 * Persist image bytes for a note and return the stable URL to reference it by.
 * Throws on an invalid note id or unsupported extension (validated again in the handler).
 */
export function saveMedia(noteId: string, ext: string, data: Uint8Array): string {
  if (!UUID_RE.test(noteId)) throw new Error('Invalid note id');
  const safeExt = normalizeExt(ext);
  if (!safeExt) throw new Error(`Unsupported image type: ${ext}`);

  const dir = path.join(assetsRoot(), noteId);
  mkdirSync(dir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${safeExt}`;
  writeFileSync(path.join(dir, filename), Buffer.from(data));

  return `${ASSET_SCHEME}://${noteId}/${filename}`;
}

/** Remove a note's entire asset folder (called when the note is deleted). No-op if absent. */
export function deleteNoteAssets(noteId: string): void {
  if (!UUID_RE.test(noteId)) return;
  rmSync(path.join(assetsRoot(), noteId), { recursive: true, force: true });
}

export function getAssetsRoot(): string {
  return assetsRoot();
}

// Resolve a studeo-asset:// URL to an on-disk path, refusing anything that would escape the
// assets root (path-traversal guard).
function resolveAssetPath(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const noteId = decodeURIComponent(url.hostname);
  const filename = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!UUID_RE.test(noteId) || !filename) return null;

  const root = assetsRoot();
  const candidate = path.normalize(path.join(root, noteId, filename));
  // Must stay strictly inside the assets root.
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  return candidate;
}

/** Register the protocol handler. Call once, after app `ready`. */
export function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const filePath = resolveAssetPath(request.url);
    if (!filePath || !existsSync(filePath)) {
      return new Response(null, { status: 404 });
    }
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const body = readFileSync(filePath);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream' },
    });
  });
}
