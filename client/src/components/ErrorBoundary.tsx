import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createLogger } from '../lib/log/logger';

const log = createLogger('react');

/**
 * Catches a render-time crash, records it, and shows something other than a
 * blank page.
 *
 * Without a boundary React unmounts the whole tree on any throw during render,
 * so a bad policy XML shape or an unexpected null in one panel takes the entire
 * editor to a white screen — with the actual error only in a devtools console
 * the user never opened. The componentStack is the part worth having: it names
 * the component that threw, which a plain stack trace of minified code does not.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('render crashed', {
      reason: error.message,
      stack: error.stack,
      componentStack: info.componentStack?.slice(0, 2000),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash-screen">
        <h2>Something in the editor crashed.</h2>
        <p>
          The error was recorded in the log. Reload to carry on — anything saved is on disk and unaffected.
        </p>
        <pre>{this.state.error.message}</pre>
        <div className="crash-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn-ghost" href="/api/logs/download">
            Download log
          </a>
        </div>
      </div>
    );
  }
}
