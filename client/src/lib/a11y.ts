import type { KeyboardEvent } from 'react';

/**
 * Props that make a non-button element behave like one for keyboard users.
 *
 * Used for rows that can't be a real `<button>` because they contain their own
 * nested buttons (the sidebar's duplicate/delete actions) — nesting buttons is
 * invalid HTML, so the row gets an explicit role and key handling instead.
 */
export function clickableRowProps(onActivate: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Space/Enter on a nested action button belongs to that button, not the row.
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onActivate();
    },
  } as const;
}
