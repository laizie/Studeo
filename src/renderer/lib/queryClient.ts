import { QueryClient, MutationCache } from '@tanstack/react-query';
import { showToast } from '../store/useToastStore';

// The QueryClient is React Query's cache manager: it holds every fetched result,
// tracks loading/error state, and knows when to refetch.
//
// It lives in its own module (rather than inside renderer.tsx, where it started) so
// that non-component code can reach the cache too. The timer store is the reason:
// it logs a finished focus block from a plain Zustand action, with no hook to call,
// and must still tell the cache that `studySessions` just changed. Components should
// keep using `useQueryClient()` — importing this directly is for code outside React.
export const queryClient = new QueryClient({
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
