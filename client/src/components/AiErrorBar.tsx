import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';

/**
 * What an AI call failed with, plus the one thing that might fix it.
 *
 * `fallbackModel` is set by the server on a 503 and only when a lighter model
 * than the one that failed exists — see fallbackFor() in server/src/lib/ai/
 * provider.js. Everything else is a plain message.
 */
export interface AiError {
  message: string;
  fallbackModel?: string;
}

/** Narrows a caught unknown into the shape this bar renders. */
export function toAiError(err: unknown): AiError {
  const e = err as Error & { fallbackModel?: string };
  return { message: e.message, fallbackModel: e.fallbackModel };
}

/**
 * The error bar under an AI action.
 *
 * It exists as its own component because of the 503 case. The free tier is
 * routinely at capacity, and the old message ended "set GEMINI_MODEL to a
 * lighter model such as gemini-3.1-flash-lite in your .env file" — an
 * instruction you could not carry out from where you were standing, in a modal
 * holding an intent line you had just typed, and which cost you that text and a
 * server restart to follow. When the server offers a fallback, that sentence is
 * a button instead: switch and re-run, in one click, without losing the work.
 *
 * Every other failure — a bad key, a workspace opt-out, a timeout — renders as
 * it always did. A recoverable error and a terminal one should not look alike,
 * and the difference here is whether there is anything to press.
 */
export function AiErrorBar({
  error,
  onRetry,
  busy,
}: {
  error: AiError;
  /** Re-runs whatever failed. Called after the model switch has been applied. */
  onRetry: () => void;
  busy?: boolean;
}) {
  const setAiModel = useStore((s) => s.setAiModel);
  const [switching, setSwitching] = useState(false);

  const switchAndRetry = async () => {
    if (!error.fallbackModel) return;
    setSwitching(true);
    try {
      // Awaited, not fired alongside the retry: the retry has to reach a server
      // that has already changed model, or it just fails on the busy one again.
      await setAiModel(error.fallbackModel);
      onRetry();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="ai-error">
      <Icon name="alert-triangle" size={14} />
      <span>{error.message}</span>
      {error.fallbackModel && (
        <button
          type="button"
          className="btn btn-sm ai-error-action"
          onClick={switchAndRetry}
          disabled={busy || switching}
          title={`Switch this server to ${error.fallbackModel} and run again. Your .env setting comes back on restart.`}
        >
          {switching ? <span className="spinner" /> : <Icon name="refresh-cw" size={13} />}
          Switch to <span className="mono">{error.fallbackModel}</span> and retry
        </button>
      )}
    </div>
  );
}
