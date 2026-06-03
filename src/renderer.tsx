import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './renderer/app/App';

// QueryClient is the cache manager for React Query.
// It holds all fetched data, tracks loading/error states, and knows when to
// refetch. We create it once here and provide it to the whole component tree.
const queryClient = new QueryClient({
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
