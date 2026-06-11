import { CloudOff, RefreshCw } from 'lucide-react';

interface Props {
  title?: string;
  message?: string;
  onRetry: () => void;
}

/**
 * Shared error state for failed data loads. A failed query must never render
 * as an empty state ("No courses yet") — that reads as data loss to a
 * returning student. Pages branch on `isError` and render this with a retry.
 */
export default function QueryErrorState({
  title = "Couldn't load this page",
  message = 'Your data is saved on this device — this is usually a brief hiccup.',
  onRetry,
}: Props) {
  return (
    <div className="py-24 text-center">
      <CloudOff size={28} className="mx-auto mb-3 text-stone-500 dark:text-[#cc9a58]" aria-hidden="true" />
      <h2 className="text-base font-semibold text-stone-700 dark:text-[#f0e0cc]">{title}</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-[#e0b870]">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] transition-colors"
      >
        <RefreshCw size={15} />
        Try again
      </button>
    </div>
  );
}
