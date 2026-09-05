import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { queryClient } from './renderer/lib/queryClient';
import ErrorBoundary from './renderer/components/ErrorBoundary';

const rootEl = document.getElementById('root')!;
const root = createRoot(rootEl);

/**
 * One document, two windows.
 *
 * The main window and the floating Pomodoro pop-out load the same index.html and are
 * told apart by their hash route (main/rendererUrl.ts builds both URLs). The two
 * branches below are dynamic imports on purpose, and this is the load-bearing part:
 * a *static* `import App` would run App's whole module graph in the pop-out too —
 * including Layout → useTimerStore — which would give that window a second, live
 * Pomodoro store. Two countdowns, two chimes, and a duplicate study session logged
 * by the store's startup recovery. The pop-out must stay a view, so it never loads
 * the app it's a view of.
 */
if (window.location.hash.startsWith('#/mini-timer')) {
  // The pop-out is a frameless, transparent window that draws its own rounded card,
  // so the page itself has to get out of the way — index.css paints an opaque body.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.overflow = 'hidden';
  rootEl.style.height = '100vh';

  void import('./renderer/features/study/MiniTimer').then(({ default: MiniTimer }) => {
    root.render(
      <StrictMode>
        <MiniTimer />
      </StrictMode>
    );
  });
} else {
  void import('./renderer/app/App').then(({ default: App }) => {
    // Two boundaries, deliberately. The one in Layout keeps the sidebar alive when a single
    // page throws, which is the common case. This one is the backstop for a throw in the
    // shell itself (Layout, Sidebar, the router) — above it there is nothing left to catch.
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary fallbackTitle="Studeo hit an unexpected error">
            <App />
          </ErrorBoundary>
        </QueryClientProvider>
      </StrictMode>
    );
  });
}
