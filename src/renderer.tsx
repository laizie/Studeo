import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './renderer/app/App';
import { queryClient } from './renderer/lib/queryClient';
import ErrorBoundary from './renderer/components/ErrorBoundary';

const rootEl = document.getElementById('root')!;
// Two boundaries, deliberately. The one in Layout keeps the sidebar alive when a single
// page throws, which is the common case. This one is the backstop for a throw in the
// shell itself (Layout, Sidebar, the router) — above it there is nothing left to catch.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary fallbackTitle="Studeo hit an unexpected error">
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
);
