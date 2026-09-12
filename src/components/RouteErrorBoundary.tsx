import { Component, type ReactNode } from 'react';
import { Plate } from '@/components/primitives/Plate';
import { PlateHeader } from '@/components/primitives/PlateHeader';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a failed lazy import (a stale chunk URL after a deploy, a network
 * drop mid-fetch) so it renders a retry state instead of an unmounted,
 * permanently blank route. React only surfaces these as render-time throws,
 * so a boundary is the only way to catch them — Suspense alone does not.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('Route failed to load:', error);
  }

  private retry = (): void => {
    // A stale chunk URL from a previous deploy won't resolve just by
    // re-rendering — only a hard reload picks up the current asset manifest.
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Plate
          tone="paper"
          spacing="none"
          marks
          className="flex min-h-dvh flex-col justify-center pt-[var(--navbar-height)]"
        >
          <PlateHeader title="Failed to load" context="Error" />
          <div className="field mt-8">
            <p className="col-lead text-lg leading-relaxed text-balance">
              This page didn't load correctly.
            </p>
          </div>
          <button
            type="button"
            onClick={this.retry}
            className="group mt-8 inline-flex w-fit items-center gap-3 border border-current px-5 py-3 font-meta transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-ink hover:text-on-ink"
          >
            Reload
          </button>
        </Plate>
      );
    }

    return this.props.children;
  }
}
