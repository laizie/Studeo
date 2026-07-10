import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import './index.css';
import App from './renderer/app/App';
import { showToast } from './renderer/store/useToastStore';

// QueryClient is the cache manager for React Query.
// It holds all fetched data, tracks loading/error states, and knows when to
// refetch. We create it once here and provide it to the whole component tree.
const queryClient = new QueryClient({
  // One net under every mutation: a failed save must never be silent. Screens
  // with their own inline error UI still get it, closer to where it happened.
  mutationCache: new MutationCache({
    onError: () => showToast("Couldn't save that — please try again."),
  }),
  defaultOptions: {
    queries: {
      // Don't retry on error — if an IPC call fails once it's likely a real bug.
      retry: false,
      // Keep data fresh for 30 seconds before background-refetching.
      staleTime: 30_000,
    },
  },
});

const rootEl = document.getElementById('root')!;
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
