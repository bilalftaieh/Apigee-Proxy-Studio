import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The tab row for both editors. Nine tabs overflow a 1280px window, so this
 * owns the two things that state needs: a visible affordance that there is
 * more to the right (an edge fade plus a scroll arrow — the row's own
 * scrollbar is 4px and hover-only, which nobody notices), and roving arrow-key
 * navigation so the row is reachable without a mouse.
 *
 * Children are expected to be `<button className="tab">` elements, with
 * `tabIndex={0}` on the active one and `-1` on the rest.
 */
export function TabBar({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 1px slack: fractional scroll positions never settle exactly on 0 / max.
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    // The row itself resizes with the window; individual tabs resize when a
    // count badge appears or changes width, which doesn't resize the row.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));
    return () => ro.disconnect();
  }, [measure, children]);

  // Tabs are also switched programmatically (addPolicy jumps to Policies,
  // addResource to Resources) — without this the action looks like a no-op
  // when the tab it selected is scrolled out of view.
  useEffect(() => {
    scrollerRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeKey]);

  const nudge = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: direction * 220, behavior: 'smooth' });
  };

  /**
   * Manual-activation tablist: arrows move focus, Enter/Space (the button's own
   * default) selects. Focus-follows-selection would mount a heavy panel —
   * Monaco, the lint run — on every keypress while scanning the row.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = Array.from(scrollerRef.current?.querySelectorAll<HTMLElement>('.tab') ?? []);
    const current = tabs.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
        ? tabs.length - 1
        : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div className="tabs-wrap" data-edge-left={edges.left || undefined} data-edge-right={edges.right || undefined}>
      <div className="tabs" role="tablist" ref={scrollerRef} onScroll={measure} onKeyDown={onKeyDown}>
        {children}
      </div>
      {/* Redundant with arrow keys, so kept out of the tab order and the a11y tree. */}
      <button type="button" className="tabs-arrow tabs-arrow-left" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)}>
        <Icon name="chevron-left" size={15} />
      </button>
      <button type="button" className="tabs-arrow tabs-arrow-right" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)}>
        <Icon name="chevron-right" size={15} />
      </button>
    </div>
  );
}
