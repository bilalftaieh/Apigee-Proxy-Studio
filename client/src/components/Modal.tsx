import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';

/**
 * Everything the browser will move focus to with Tab. `:not([disabled])`
 * matters for the footers here, where the confirm button is routinely disabled
 * until a field is filled in.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** offsetParent is null for anything display:none'd; the rect check catches
    the rest (a collapsed panel, a zero-height wrapper). */
function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

/**
 * Where focus should actually go when the dialog closes.
 *
 * Usually the element that opened it — but plenty of the openers here live in
 * groups that are only shown on hover or focus: a row's duplicate/delete pair,
 * and the sidebar rail's actions, which disappear entirely when the flyout
 * closes behind the dialog. Focusing a hidden element is a silent no-op that
 * drops focus to <body>, so fall back to the nearest still-visible control in
 * the same row, which is where the user was.
 */
function restoreTarget(opener: HTMLElement): HTMLElement | null {
  if (!document.contains(opener)) return null;
  if (isVisible(opener)) return opener;
  const row = opener.closest<HTMLElement>('.nav-item, .policy-list-item, .test-list-item, .flow-card, .entity-row');
  return (row && focusableWithin(row)[0]) ?? null;
}

/**
 * Open dialogs, oldest first. Modals nest here — HistoryModal renders both the
 * restore confirmation and the diff view inside itself — and every instance
 * used to put its own Escape handler on `window`, so one Escape ran all of
 * them: cancelling the restore prompt threw away the history list behind it
 * too. Only the dialog on top of this stack answers Escape or traps Tab.
 */
const openDialogs: symbol[] = [];

export function Modal({
  title,
  onClose,
  children,
  wide,
  xl,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** Wider still than `wide` — for content with its own internal layout, like a file list + diff view. */
  xl?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const tokenRef = useRef<symbol>();
  if (!tokenRef.current) tokenRef.current = Symbol('dialog');

  useEffect(() => {
    const token = tokenRef.current!;
    openDialogs.push(token);
    return () => {
      const i = openDialogs.indexOf(token);
      if (i !== -1) openDialogs.splice(i, 1);
    };
  }, []);

  const isTopmost = () => openDialogs[openDialogs.length - 1] === tokenRef.current;

  /**
   * Focus in on open, and back where it came from on close.
   *
   * Opening used to leave focus on <body>: a keyboard user's next Tab started
   * at the top of the page *behind* the dialog, and a screen reader announced
   * nothing at all. Closing then left focus on <body> as well, so the button
   * you opened the dialog with was gone from under you.
   */
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    // React's own autoFocus has already run by now; only place focus if
    // nothing inside claimed it, or we would yank it off the primary action.
    if (node && !node.contains(document.activeElement)) {
      // Into the content, not onto the head's close button — that is chrome,
      // and landing there makes the first Tab feel like it went backwards.
      // Dialogs that lead with a field (name a new proxy, pick a template)
      // get the caret in it; the rest get the dialog itself, so the title is
      // announced and Tab walks into the body from the top.
      const content = node.querySelector<HTMLElement>('.modal-content');
      (((content && focusableWithin(content)[0]) as HTMLElement | undefined) ?? node).focus();
    }
    return () => {
      // The opener can have been removed while the dialog was up — deleting the
      // row whose menu opened it, for one — or hidden, if it was a hover-only
      // action. Either way, focusing it would drop focus to <body>, which is
      // the thing this is here to prevent.
      if (returnTo) restoreTarget(returnTo)?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopmost()) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Keeps Tab inside the dialog. Without it, tabbing past the last control
   * walked into the page behind the backdrop — still focusable, still
   * clickable by keyboard, and completely invisible under the dim.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !isTopmost()) return;
    const node = dialogRef.current;
    if (!node) return;
    const items = focusableWithin(node);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !node.contains(active);
    if (e.shiftKey && (active === first || outside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || outside)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${xl ? 'modal-xl' : wide ? 'modal-lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
