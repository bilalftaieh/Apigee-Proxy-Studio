import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import type { AiModelOption } from '../types/proxy';

/** Fixed-position box for the menu. Exactly one of top/bottom is set. */
interface Anchor {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Shows which model the AI features are running, and switches it.
 *
 * It exists because of one failure: the free tier returns 503 "at capacity" at
 * peak times, and the only cure used to be editing GEMINI_MODEL in .env and
 * restarting the server — from inside a modal holding an intent line the user
 * had just typed, which the restart would throw away. The switch is now a
 * click, and the work stays where it is.
 *
 * The choice lasts until the server restarts and is never written to .env, so
 * this deliberately labels itself that way rather than letting someone assume
 * they have changed the permanent setting. `source` comes from the server, not
 * from whether this component happens to have been clicked, so a second browser
 * tab describes the override correctly too.
 *
 * Renders nothing at all when there is no API key — every AI surface is hidden
 * in that case anyway, and a picker for a feature that is off is just noise.
 */
export function AiModelPicker() {
  const aiStatus = useStore((s) => s.aiStatus);
  const setAiModel = useStore((s) => s.setAiModel);
  const [open, setOpen] = useState(false);
  // Google's full lineup, fetched on first open. Null means "not asked yet",
  // which is what makes the menu show the vouched-for pair instantly instead of
  // an empty box for the length of a round trip.
  const [live, setLive] = useState<AiModelOption[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Where to draw the panel, in viewport coordinates. Null until measured.
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  /**
   * Positions the panel against the chip, in fixed coordinates.
   *
   * The panel is portalled to <body> rather than drawn inside this component,
   * because .modal-content is overflow:hidden — a menu of a dozen models opened
   * from a dialog was simply cut off at the dialog's edge, with everything past
   * the second row invisible. Nothing inside a clipping ancestor can escape it,
   * so the panel leaves the subtree entirely and is placed by measurement.
   *
   * It opens downward when there is room and flips above the chip when there is
   * not, and either way it is told how tall it may be, so the list scrolls
   * rather than running off the screen.
   */
  const place = useCallback(() => {
    const chip = rootRef.current;
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    const GAP = 6;
    const MARGIN = 12;
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    // Only flip when below is genuinely cramped AND above is roomier, so the
    // menu does not jump sides for the sake of a few pixels.
    const flip = below < 260 && above > below;

    // Right-aligned to the chip, which sits at the right-hand end of a header
    // row — left-aligning ran a 400px menu straight off the screen. Clamped to
    // the viewport either way, because the chip can be anywhere.
    // offsetWidth is 0 on the first pass, before the panel exists; the layout
    // effect below re-runs this once it does, with the real width.
    const width = panelRef.current?.offsetWidth || 320;
    const left = Math.max(MARGIN, Math.min(r.right - width, window.innerWidth - width - MARGIN));

    // Both keys always present (one undefined) so the union does not narrow to
    // a shape without the other — the comparison below reads them both.
    const next: Anchor = {
      left,
      top: flip ? undefined : r.bottom + GAP,
      bottom: flip ? window.innerHeight - r.top + GAP : undefined,
      maxHeight: Math.max(180, flip ? above : below),
    };
    // Returning the SAME object when nothing moved is what stops the measure →
    // setState → re-measure cycle below from looping forever.
    setAnchor((prev) =>
      prev &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.bottom === next.bottom &&
      prev.maxHeight === next.maxHeight
        ? prev
        : next
    );
  }, []);

  // Second pass, once the panel is actually in the DOM and can be measured.
  // The first pass has to guess a width to place something that does not exist
  // yet; this corrects it before the browser paints, so nothing visibly jumps.
  useLayoutEffect(() => {
    if (open && anchor && panelRef.current) place();
  }, [open, anchor, place]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // A fixed-position panel does not travel with anything that moves under it,
    // so it is repositioned rather than left floating in the wrong place.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Same dismissal contract as ExportMenu: click outside or Escape. The panel
  // is checked separately from the chip — it is portalled out of this subtree,
  // so contains() on the root alone would treat every click in the menu as an
  // outside click and close it before the choice registered.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inside = rootRef.current?.contains(target) || panelRef.current?.contains(target);
      if (!inside) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Guards the fetch with a ref rather than the loading flag, because the flag
  // cannot do this job: putting it in the dependency list means setting it
  // re-runs the effect, whose cleanup then cancels the request that had just
  // been started — the list never arrived and the menu silently stayed short.
  // A ref changes without re-rendering, so `open` is the only real dependency.
  const requested = useRef(false);

  // Fetched once per mount rather than on every open: the server caches this
  // for ten minutes anyway, so re-asking on each click would mostly re-render
  // the same list a moment later for no reason.
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    let cancelled = false;
    setLoadingLive(true);
    api
      .aiModels()
      .then((r) => !cancelled && setLive(r.models))
      .catch(() => {
        // listModels() already falls back server-side, so reaching here means
        // the request itself failed. The short list stays; it still works.
        requested.current = false;
      })
      .finally(() => !cancelled && setLoadingLive(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const shown = live ?? aiStatus?.models ?? [];
  const [recommended, others] = useMemo(
    () => [shown.filter((m) => m.recommended), shown.filter((m) => !m.recommended)],
    [shown]
  );

  if (!aiStatus?.configured) return null;

  const overridden = aiStatus.source === 'override';

  const row = (m: AiModelOption) => (
    <button
      key={m.id}
      type="button"
      className="ai-model-item"
      role="menuitemradio"
      aria-checked={m.id === aiStatus.model}
      onClick={() => {
        setOpen(false);
        setAiModel(m.id);
      }}
    >
      <span className="ai-model-item-check">
        {m.id === aiStatus.model && <Icon name="check" size={14} />}
      </span>
      <span className="ai-model-item-body">
        <span className="ai-model-item-label mono">{m.id}</span>
        <span className="ai-model-item-hint">{m.note}</span>
      </span>
    </button>
  );

  return (
    <div className="ai-model-picker" ref={rootRef}>
      <button
        type="button"
        className="ai-model-chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          overridden
            ? `Using ${aiStatus.model} for this session. Restarting the server restores your .env setting.`
            : `Using ${aiStatus.model}, from your .env file. Switch if this one is busy.`
        }
      >
        <Icon name="brain-circuit" size={13} />
        <span className="mono">{aiStatus.model}</span>
        {overridden && <span className="ai-model-chip-flag">until restart</span>}
        <Icon name="chevron-down" size={12} />
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            className="ai-model-panel"
            role="menu"
            ref={panelRef}
            style={{
              left: anchor.left,
              top: anchor.top,
              bottom: anchor.bottom,
              maxHeight: anchor.maxHeight,
            }}
          >
            <div className="ai-model-panel-title">Tested with this app</div>
            {recommended.map(row)}

            {/* Everything else the key can reach. Listed rather than hardcoded:
                Google adds and retires models on its own schedule, and a menu
                baked into the source is wrong the day after it ships. */}
            {others.length > 0 && (
              <>
                <div className="ai-model-panel-title">Also available on your key</div>
                <div className="ai-model-scroll">{others.map(row)}</div>
              </>
            )}

            {loadingLive && (
              <p className="ai-model-panel-loading">
                <span className="spinner" /> Asking Google what else your key can use…
              </p>
            )}

            <p className="ai-model-panel-foot">
              Switching applies to this server until it restarts. Set{' '}
              <code className="mono">GEMINI_MODEL</code> in <code className="mono">.env</code> to make
              a choice permanent.
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}
