// Setup dialog shown when the user wants to connect Spotify for the first time.
//
// It walks them through registering a free Spotify Developer app (needed to get
// a Client ID) and then starts the PKCE OAuth flow. No client secret is ever
// entered here — PKCE doesn't need one.

import { useState } from 'react';
import { X, ExternalLink, Music } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpotifySetupDialog({ isOpen, onClose }: Props) {
  const [clientId, setClientId] = useState('');
  const [step, setStep]         = useState<'instructions' | 'connect'>('instructions');
  const qc = useQueryClient();

  const connectMutation = useMutation({
    mutationFn: (id: string) => window.api.spotify.connect(id),
    onSuccess: () => {
      // The browser will open; once the user authorises, main sends
      // spotify:auth-callback which useSpotifyAuthListener picks up
      // and invalidates the status query. We just close this dialog.
      qc.invalidateQueries({ queryKey: ['spotify'] });
      onClose();
    },
  });

  function handleConnect() {
    const id = clientId.trim();
    if (!id) return;
    connectMutation.mutate(id);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-[#2c1f14] rounded-2xl shadow-2xl border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center shrink-0">
              <Music size={15} className="text-white" />
            </div>
            <h2 className="text-base font-semibold text-stone-800 dark:text-[#f0e0cc]">
              Connect Spotify
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-[#442918] warm:hover:bg-[#6e4c30] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === 'instructions' ? (
            <>
              <p className="text-sm text-stone-600 dark:text-[#d4b896] mb-5 leading-relaxed">
                ClassTrack uses the Spotify Web API to control playback from your Spotify app.
                You'll need a free <strong className="text-stone-800 dark:text-[#f0e0cc]">Spotify Developer</strong> app to get a Client ID — it only takes about 2 minutes.
              </p>

              <div className="space-y-3 mb-6">
                {[
                  {
                    n: '1',
                    text: <>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-[#1DB954] underline hover:opacity-80">developer.spotify.com/dashboard</a> and log in with your Spotify account.</>,
                  },
                  {
                    n: '2',
                    text: <>Click <strong className="text-stone-700 dark:text-[#f0e0cc]">Create app</strong>. Give it any name (e.g. "ClassTrack"). The description and website fields can be anything.</>,
                  },
                  {
                    n: '3',
                    text: <>Under <strong className="text-stone-700 dark:text-[#f0e0cc]">Redirect URIs</strong>, add exactly: <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-[#442918] warm:bg-[#6e4c30] text-xs font-mono">classtrack://spotify-callback</code></>,
                  },
                  {
                    n: '4',
                    text: <>Choose <strong className="text-stone-700 dark:text-[#f0e0cc]">Web API</strong> for the API/SDK, then save. Copy the <strong className="text-stone-700 dark:text-[#f0e0cc]">Client ID</strong> shown on the app overview page.</>,
                  },
                ].map(({ n, text }) => (
                  <div key={n} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-stone-100 dark:bg-[#442918] warm:bg-[#6e4c30] text-xs font-semibold flex items-center justify-center text-stone-500 dark:text-[#c4a882] mt-0.5">
                      {n}
                    </span>
                    <p className="text-sm text-stone-600 dark:text-[#d4b896] leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1DB954] text-white text-sm font-medium hover:bg-[#17a349] transition-colors"
                >
                  <ExternalLink size={13} />
                  Open Spotify Dashboard
                </a>
                <button
                  onClick={() => setStep('connect')}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] text-stone-600 dark:text-[#c4a882] hover:bg-stone-50 dark:hover:bg-[#3d2b1f] warm:hover:bg-[#5d4b3f] transition-colors"
                >
                  I have my Client ID →
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-600 dark:text-[#d4b896] mb-4 leading-relaxed">
                Paste your Client ID below. After clicking <strong className="text-stone-700 dark:text-[#f0e0cc]">Authorize</strong>, your browser will open Spotify's login page. Once you approve access, you'll be redirected back automatically.
              </p>

              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="e.g. 3a8d2f1c4b6e9d7a5c2f8b4e1d6a9c3f"
                className={cn(
                  'w-full px-3 py-2 text-sm border rounded-lg mb-4',
                  'font-mono placeholder:font-sans placeholder:text-stone-300 dark:placeholder:text-[#775544]',
                  'border-stone-200 dark:border-[#442918] warm:border-[#6e4c30]',
                  'bg-white dark:bg-[#332211] warm:bg-[#3d2918]',
                  'text-stone-800 dark:text-[#f0e0cc]',
                  'focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40',
                )}
                autoFocus
              />

              <div className="flex items-center gap-3">
                <button
                  onClick={handleConnect}
                  disabled={!clientId.trim() || connectMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-[#1DB954] text-white text-sm font-medium hover:bg-[#17a349] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connectMutation.isPending ? 'Opening browser…' : 'Authorize with Spotify'}
                </button>
                <button
                  onClick={() => setStep('instructions')}
                  className="text-sm text-stone-400 dark:text-[#c4a882] hover:text-stone-600 transition-colors"
                >
                  ← Back
                </button>
              </div>

              {connectMutation.isError && (
                <p className="mt-3 text-xs text-red-400">
                  Something went wrong. Check that your Client ID is correct and the redirect URI is set up.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
