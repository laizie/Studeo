// Spotify PKCE OAuth flow + encrypted token storage.
//
// Why localhost instead of a custom protocol (classtrack://)?
// Custom protocols require the OS to register the app as a handler, which is
// unreliable in Electron dev mode (the Electron binary gets registered, not the
// project). The reliable cross-platform approach is to spin up a one-time HTTP
// server on localhost before opening the browser. Spotify redirects back to
// http://127.0.0.1:8888/spotify-callback, our server catches the code, then
// shuts down. Works identically in dev and in a packaged app.

import { app, safeStorage, shell } from 'electron';
import * as crypto from 'node:crypto';
import * as http   from 'node:http';
import * as fs     from 'node:fs';
import * as path   from 'node:path';

const CALLBACK_PORT = 8888;
const REDIRECT_URI  = `http://127.0.0.1:${CALLBACK_PORT}/spotify-callback`;

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-email',
  'user-read-private',
].join(' ');

// ── File paths ────────────────────────────────────────────────────────────────

function tokenFile():  string { return path.join(app.getPath('userData'), 'spotify-tokens.enc'); }
function configFile(): string { return path.join(app.getPath('userData'), 'spotify-config.json'); }

// ── Token shape ───────────────────────────────────────────────────────────────

interface SpotifyTokens {
  access_token:  string;
  refresh_token: string;
  expires_at:    number; // Unix ms
}

// ── In-memory PKCE state ──────────────────────────────────────────────────────

let pendingVerifier: string | null = null;
let pendingState:    string | null = null;

// Called by main.ts after registering handlers so spotifyAuth can notify the
// renderer when auth completes without importing BrowserWindow directly.
let onAuthComplete: ((success: boolean) => void) | null = null;
export function setAuthCompletionHandler(handler: (success: boolean) => void): void {
  onAuthComplete = handler;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Client ID config ──────────────────────────────────────────────────────────

export function getClientId(): string | null {
  const file = configFile();
  if (!fs.existsSync(file)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8')) as { clientId?: string };
    return cfg.clientId || null;
  } catch { return null; }
}

export function setClientId(clientId: string): void {
  fs.writeFileSync(configFile(), JSON.stringify({ clientId }), 'utf-8');
}

// ── Token storage ─────────────────────────────────────────────────────────────

export function loadTokens(): SpotifyTokens | null {
  const file = tokenFile();
  if (!fs.existsSync(file)) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const buf  = fs.readFileSync(file);
    const json = safeStorage.decryptString(buf);
    return JSON.parse(json) as SpotifyTokens;
  } catch { return null; }
}

export function saveTokens(tokens: SpotifyTokens): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const buf = safeStorage.encryptString(JSON.stringify(tokens));
  fs.writeFileSync(tokenFile(), buf);
}

export function clearTokens(): void {
  const file = tokenFile();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ── Localhost callback server ─────────────────────────────────────────────────

let callbackServer: http.Server | null = null;

function callbackPage(success: boolean, detail?: string): string {
  const color = success ? '#15803d' : '#be123c';
  const bg    = success ? '#f0fdf4' : '#fff1f2';
  const title = success ? '✓ Connected to Spotify!' : 'Authorization failed';
  const body  = success
    ? 'You can close this tab and return to Studeo.'
    : 'You can close this tab and try again in Studeo.';
  const detailHtml = detail
    ? `<p style="margin-top:8px;font-size:12px;color:#9ca3af;font-family:monospace">${detail}</p>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;background:${bg}}
.c{text-align:center;padding:40px;background:#fff;border-radius:16px;
box-shadow:0 4px 20px rgba(0,0,0,.08)}h2{margin:0 0 8px;color:${color}}
p{margin:0;color:#6b7280}</style></head>
<body><div class="c"><h2>${title}</h2><p>${body}</p>${detailHtml}</div>
<script>setTimeout(()=>window.close(),4000)</script></body></html>`;
}

function startCallbackServer(): void {
  if (callbackServer) return;

  callbackServer = http.createServer(async (req, res) => {
    const url   = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`);
    if (url.pathname !== '/spotify-callback') {
      res.writeHead(404); res.end(); return;
    }

    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    console.log('[Spotify callback]', { code: code ? '(present)' : null, state, error });

    if (error || !code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackPage(false, error ?? 'no_code'));
      cleanup();
      onAuthComplete?.(false);
      return;
    }

    // Do the token exchange BEFORE responding so the browser shows the real outcome
    const syntheticUrl = `studeo://cb?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state ?? '')}`;
    const success = await exchangeCode(syntheticUrl);
    console.log('[Spotify token exchange]', success ? 'succeeded' : 'failed');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(callbackPage(success));
    cleanup();
    onAuthComplete?.(success);
  });

  callbackServer.on('error', () => {
    // Port in use or other error — auth will silently fail; user can retry
    callbackServer = null;
  });

  callbackServer.listen(CALLBACK_PORT, '127.0.0.1');
}

function cleanup(): void {
  callbackServer?.close();
  callbackServer = null;
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

export function initiateAuth(clientId: string): void {
  const verifier  = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state     = base64url(crypto.randomBytes(16));

  pendingVerifier = verifier;
  pendingState    = state;

  startCallbackServer();

  const params = new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });

  shell.openExternal(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

// Parses code+state from a synthetic URL and exchanges for tokens.
async function exchangeCode(syntheticUrl: string): Promise<boolean> {
  const parsed = new URL(syntheticUrl);
  const code   = parsed.searchParams.get('code');
  const state  = parsed.searchParams.get('state');

  if (!code || state !== pendingState || !pendingVerifier) return false;

  const clientId = getClientId();
  if (!clientId) return false;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     clientId,
        code_verifier: pendingVerifier,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[Spotify token exchange failed]', res.status, body);
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    saveTokens({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Date.now() + (data.expires_in as number) * 1000,
    });

    pendingVerifier = null;
    pendingState    = null;
    return true;
  } catch (e) {
    console.error('[Spotify exchangeCode exception]', e);
    return false;
  }
}

// ── Token refresh ─────────────────────────────────────────────────────────────

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;

  const clientId = getClientId();
  if (!clientId) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id:     clientId,
      }),
    });

    if (!res.ok) { clearTokens(); return null; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data    = await res.json() as any;
    const updated: SpotifyTokens = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? tokens.refresh_token,
      expires_at:    Date.now() + (data.expires_in as number) * 1000,
    };
    saveTokens(updated);
    return updated.access_token;
  } catch {
    return null;
  }
}
