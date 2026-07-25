import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — pass the route so navigating clears the error. */
  resetKey?: string;
  /** Shown instead of the default panel (used for the root-level backstop). */
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time throw and shows a recoverable panel instead of losing the app.
 *
 * Why this has to exist here: a single throw during render unmounts the ENTIRE React
 * tree, leaving a blank window. In a browser that's a reload away; in a packaged desktop
 * app there's no address bar and no reload button — the only route back is View → Reload
 * in the menu bar (which most students will never find) or force-quitting. One bad date,
 * an unexpected null from a `row as Course` cast, or a malformed note document shouldn't
 * cost someone their whole session.
 *
 * Still a class component: `componentDidCatch` / `getDerivedStateFromError` have no hook
 * equivalent, so this is the one place in the codebase that can't be a function component.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Goes to the devtools console in dev and to the terminal in a packaged run
    // (ELECTRON_ENABLE_LOGGING=1). The component stack is the useful half.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    // Navigating away should clear the error — otherwise one broken screen would keep
    // showing its panel after the user has moved on to a perfectly healthy page.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-8">
        <div className="py-24 text-center">
          <AlertTriangle size={28} className="mx-auto mb-3 text-muted" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">
            {this.props.fallbackTitle ?? 'Something went wrong on this screen'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your data is safe on this device — nothing was lost. Try again, or move to
            another screen in the sidebar.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-ink transition-colors hover:bg-accent-deep active:scale-[0.98]"
          >
            <RefreshCw size={15} />
            Try again
          </button>
          {/* The message, not the stack: enough for a bug report, quiet enough to ignore. */}
          <p className="mx-auto mt-6 max-w-md break-words font-mono text-xs text-muted">
            {error.message}
          </p>
        </div>
      </div>
    );
  }
}
