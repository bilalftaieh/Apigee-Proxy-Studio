import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StepList } from './StepList';
import { Icon } from './Icon';
import { Switch } from './Switch';
import { computeFlowCondition } from '../lib/condition';
import { useUiStore } from '../store/useUiStore';
import type { StepLocation } from '../store/useStore';
import type { ConditionVerb, Flow, PathOperator } from '../types/proxy';

const VERBS: ConditionVerb[] = ['ANY', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

/**
 * Above this many flows the cards start collapsed.
 *
 * An expanded card is roughly 450px — a condition editor and two step lists —
 * so a real proxy's thirteen of them made this tab 7,200px of continuous
 * scroll, nearly ten screens, with no way to shorten it. Reaching the twelfth
 * flow meant scrolling past five thousand pixels of other flows' editors.
 *
 * Three is the most that still fits a reasonable window without the list
 * itself becoming the problem, and it keeps the common small proxy exactly as
 * it was: nothing to expand, nothing to click.
 */
const COLLAPSE_ABOVE = 3;

/** What a collapsed card says about itself: the route it matches, and its size. */
function flowSummary(flow: Flow): { route: string; steps: string } {
  const route =
    flow.conditionMode === 'custom'
      ? flow.condition || 'no condition'
      : [flow.verb && flow.verb !== 'ANY' ? flow.verb : null, flow.pathValue || null]
          .filter(Boolean)
          .join(' ') || 'no condition';

  const request = flow.request.length;
  const response = flow.response.length;
  const steps =
    request === 0 && response === 0
      ? 'no steps'
      : [request ? `${request} request` : null, response ? `${response} response` : null].filter(Boolean).join(' · ');

  return { route, steps };
}

export function ConditionalFlowsSection({
  flows,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  stepLocation,
  emptyHint,
  phaseNumber,
}: {
  flows: Flow[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Flow>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  stepLocation: (flowId: string, phase: 'request' | 'response') => StepLocation;
  emptyHint: string;
  phaseNumber?: number;
}) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const jumpToNewRef = useRef(false);
  /** The card to tint briefly — the one just added, or the one just revealed. */
  const [flashId, setFlashId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(false);
  const [stuck, setStuck] = useState(false);

  const expandedFlowIds = useUiStore((s) => s.expandedFlowIds);
  const setFlowExpanded = useUiStore((s) => s.setFlowExpanded);
  const setManyFlowsExpanded = useUiStore((s) => s.setManyFlowsExpanded);
  const revealedFlowId = useUiStore((s) => s.revealedFlowId);
  const clearRevealedFlow = useUiStore((s) => s.clearRevealedFlow);

  const collapsible = flows.length > COLLAPSE_ABOVE;
  const expandedSet = useMemo(() => new Set(expandedFlowIds), [expandedFlowIds]);
  // Short lists have nothing to collapse, so they ignore the set entirely
  // rather than needing every id seeded into it.
  const isOpen = useCallback(
    (id: string) => !collapsible || expandedSet.has(id),
    [collapsible, expandedSet]
  );

  const openCount = collapsible ? flows.filter((f) => expandedSet.has(f.id)).length : flows.length;
  const allOpen = openCount === flows.length;

  /* Collapsing is for a list that arrives long, not for one that grows long
     under you. A proxy with three flows shows them all open; adding a fourth
     crosses the threshold, and without this the three you were reading would
     snap shut in the same gesture. They were never in the expanded set —
     nothing needed to be, below the threshold — so seed them as the threshold
     is crossed. The ref starts at the mount-time value, so a proxy that opens
     with thirteen flows is not a crossing and still starts collapsed. */
  const wasCollapsible = useRef(collapsible);
  useEffect(() => {
    if (collapsible && !wasCollapsible.current) {
      setManyFlowsExpanded(flows.map((f) => f.id), true);
    }
    wasCollapsible.current = collapsible;
  }, [collapsible, flows, setManyFlowsExpanded]);

  /**
   * Brings a card into view and marks it, without assuming it is already laid
   * out: a card that was collapsed a moment ago has to render its body before
   * scrollIntoView can land on the right place.
   */
  const revealCard = useCallback((id: string, focusName: boolean) => {
    requestAnimationFrame(() => {
      const card = cardRefs.current[id];
      if (!card) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      if (focusName) {
        const nameInput = card.querySelector<HTMLInputElement>('input.flow-name');
        nameInput?.focus({ preventScroll: true });
        nameInput?.select();
      }
      setFlashId(id);
    });
  }, []);

  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(null), 2200);
    return () => clearTimeout(timer);
  }, [flashId]);

  const applySimple = (flow: Flow, patch: Partial<Pick<Flow, 'pathValue' | 'pathOperator' | 'verb'>>) => {
    const pathOperator = patch.pathOperator ?? flow.pathOperator ?? 'MatchesPath';
    const pathValue = patch.pathValue ?? flow.pathValue ?? '';
    const verb = patch.verb ?? flow.verb ?? 'ANY';
    onUpdate(flow.id, {
      ...patch,
      conditionMode: 'simple',
      condition: computeFlowCondition(pathOperator, pathValue, verb),
    });
  };

  const handleAdd = () => {
    jumpToNewRef.current = true;
    onAdd();
  };

  /* A new flow is appended to the end of a list that is often several screens
     long, so adding one meant scrolling back down to hunt for it. Ride along
     with it instead: open it (it arrives collapsed like everything else once
     the list is long), scroll it into view, put the caret in its name, and
     tint the card briefly so it is obvious which one is new. */
  useEffect(() => {
    if (!jumpToNewRef.current) return;
    jumpToNewRef.current = false;
    const newest = flows[flows.length - 1];
    if (!newest) return;
    setFlowExpanded(newest.id, true);
    revealCard(newest.id, true);
  }, [flows.length, setFlowExpanded, revealCard]);

  /* Someone asked for a specific flow — the command palette, today. Only the
     section that actually holds it responds; the proxy endpoint and each
     target endpoint all render one of these, and the other ones must not
     scroll or steal the request. */
  useEffect(() => {
    if (!revealedFlowId) return;
    if (!flows.some((f) => f.id === revealedFlowId)) return;
    clearRevealedFlow();
    setFlowExpanded(revealedFlowId, true);
    revealCard(revealedFlowId, false);
  }, [revealedFlowId, flows, clearRevealedFlow, setFlowExpanded, revealCard]);

  /* A heading that has lifted off its card and is floating over the list is a
     different object from one sitting at the top of it, and it has to look
     like one — pinned with the same flat styling, it read as a stray strip of
     chrome glued under the tab bar. Only the lifted state gets the shadow. */
  useEffect(() => {
    const bar = barRef.current;
    const scroller = bar?.closest('.tab-panel');
    if (!bar || !scroller) return;
    const update = () => {
      const next = bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top < 1;
      if (next === stuckRef.current) return;
      stuckRef.current = next;
      setStuck(next);
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, []);

  const activeCount = flows.filter((f) => f.enabled !== false).length;
  const inactiveCount = flows.length - activeCount;

  return (
    <div className="card">
      {/* The section is routinely taller than the viewport, so its Add button
          rides the top of the scroller — adding a flow from the middle of the
          list shouldn't cost a trip up to the header and back down again. */}
      <div className="row-between flows-sticky-bar" data-stuck={stuck} ref={barRef}>
        <h4 className="card-title" style={{ margin: 0 }}>
          {phaseNumber != null && <span className="phase-badge flows">{phaseNumber}</span>}
          <Icon name="git-fork" size={15} /> Conditional Flows
          {/* Spelled out, not a second numeric badge — beside the blue phase
              badge a bare "4" reads as another step number. */}
          {flows.length > 0 && (
            <span className="flows-count">
              {flows.length} flow{flows.length === 1 ? '' : 's'}
            </span>
          )}
        </h4>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {collapsible && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setManyFlowsExpanded(flows.map((f) => f.id), !allOpen)}
              title={allOpen ? 'Collapse every flow in this section' : 'Open every flow in this section'}
            >
              <Icon name={allOpen ? 'chevrons-down-up' : 'chevrons-up-down'} size={13} />
              <span className="btn-label">{allOpen ? 'Collapse all' : 'Expand all'}</span>
            </button>
          )}
          <button className="btn btn-sm" onClick={handleAdd}>
            <Icon name="plus" size={13} /> Add Flow
          </button>
        </div>
      </div>
      <p className="card-subtitle">
        Matched top-to-bottom by condition against the request.
        {inactiveCount > 0 && (
          <>
            {' '}
            <strong>{activeCount}</strong> active, <strong>{inactiveCount}</strong> parked —{' '}
            <span title="Parked flows are kept here but left out of the exported bundle entirely, as if deleted.">
              turned off, not deleted
            </span>
            .
          </>
        )}
      </p>

      {flows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 2px' }}>{emptyHint}</div>}

      {flows.map((flow, i) => {
        const isEnabled = flow.enabled !== false;
        const open = isOpen(flow.id);
        const summary = flowSummary(flow);
        const bodyId = `flow-body-${flow.id}`;
        return (
        <div
          className={`flow-card ${isEnabled ? '' : 'flow-card-disabled'} ${flow.id === flashId ? 'flow-card-new' : ''}`}
          data-collapsed={!open || undefined}
          key={flow.id}
          ref={(el) => {
            cardRefs.current[flow.id] = el;
          }}
        >
          <div className="flow-card-head">
            <div className="flow-order-btns">
              <button className="icon-btn" onClick={() => onMove(flow.id, -1)} disabled={i === 0} aria-label="Move up">
                <Icon name="chevron-up" size={13} />
              </button>
              <button
                className="icon-btn"
                onClick={() => onMove(flow.id, 1)}
                disabled={i === flows.length - 1}
                aria-label="Move down"
              >
                <Icon name="chevron-down" size={13} />
              </button>
            </div>
            {/* The subtitle says these are matched top-to-bottom; nothing used
                to say where in that order any given card sat. It matters most
                once the list is collapsed and a card's neighbours are off
                screen. */}
            <span className="flow-order-index" title={`Match position ${i + 1} of ${flows.length}`}>
              {i + 1}
            </span>
            <div className="flow-card-toggle-wrap">
              <Switch
                checked={isEnabled}
                onChange={(checked) => onUpdate(flow.id, { enabled: checked })}
                label={`${isEnabled ? 'Disable' : 'Enable'} flow "${flow.name}"`}
                title={
                  isEnabled
                    ? 'Active — turn off to park this flow without deleting it'
                    : 'Parked — excluded from the exported bundle; turn on to make it live again'
                }
              />
              {!isEnabled && (
                <span className="flow-inactive-badge">
                  <Icon name="moon" size={10} /> Parked
                </span>
              )}
            </div>
            {collapsible && (
              <button
                type="button"
                className="icon-btn flow-collapse-btn"
                aria-expanded={open}
                aria-controls={bodyId}
                aria-label={`${open ? 'Collapse' : 'Expand'} flow "${flow.name}"`}
                title={open ? 'Collapse' : 'Expand'}
                onClick={() => setFlowExpanded(flow.id, !open)}
              >
                <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
              </button>
            )}
            <input
              className="flow-name"
              title={flow.name}
              value={flow.name}
              onChange={(e) => onUpdate(flow.id, { name: e.target.value })}
            />
            {open ? (
              <input
                className="flow-desc-input"
                placeholder="Optional description"
                value={flow.description || ''}
                onChange={(e) => onUpdate(flow.id, { description: e.target.value })}
              />
            ) : (
              /* Standing in for the description input while closed, and doing
                 the job the row actually needs then: saying what this flow
                 matches and how big it is, so the list is readable without
                 opening thirteen cards. Also a second, much larger target for
                 the chevron beside it. */
              <button
                type="button"
                className="flow-card-summary"
                aria-expanded={false}
                aria-controls={bodyId}
                aria-label={`Expand flow "${flow.name}"`}
                onClick={() => setFlowExpanded(flow.id, true)}
              >
                <span className="flow-card-summary-route mono" title={flow.condition || undefined}>
                  {summary.route}
                </span>
                <span className="flow-card-summary-steps">{summary.steps}</span>
                {flow.description && <span className="flow-card-summary-desc">{flow.description}</span>}
              </button>
            )}
            <button className="icon-btn" onClick={() => onRemove(flow.id)} aria-label="Delete flow" title="Delete permanently">
              <Icon name="trash-2" size={14} />
            </button>
          </div>

          {open && (
          <div id={bodyId}>
          <div className="field" style={{ marginBottom: 12 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <label style={{ margin: 0 }}>Condition</label>
              <div className="mode-toggle">
                <button
                  type="button"
                  className={flow.conditionMode !== 'custom' ? 'active' : ''}
                  onClick={() => applySimple(flow, {})}
                >
                  Path / Verb
                </button>
                <button
                  type="button"
                  className={flow.conditionMode === 'custom' ? 'active' : ''}
                  onClick={() => onUpdate(flow.id, { conditionMode: 'custom' })}
                >
                  Custom
                </button>
              </div>
            </div>

            {flow.conditionMode === 'custom' ? (
              <input
                className="condition-input"
                placeholder='e.g. (proxy.pathsuffix MatchesPath "/users/*") and (request.verb = "GET")'
                value={flow.condition}
                onChange={(e) => onUpdate(flow.id, { condition: e.target.value })}
              />
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={flow.pathOperator || 'MatchesPath'}
                  onChange={(e) => applySimple(flow, { pathOperator: e.target.value as PathOperator })}
                >
                  <option value="MatchesPath">Path matches</option>
                  <option value="Equals">Path equals</option>
                </select>
                <input
                  className="mono"
                  style={{ flex: 1, minWidth: 140 }}
                  placeholder="/users/* (leave blank to ignore path)"
                  value={flow.pathValue || ''}
                  onChange={(e) => applySimple(flow, { pathValue: e.target.value })}
                />
                <span className="field-hint">and verb</span>
                <select value={flow.verb || 'ANY'} onChange={(e) => applySimple(flow, { verb: e.target.value as ConditionVerb })}>
                  {VERBS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field-hint mono" style={{ marginTop: 8 }}>
              {flow.condition || 'No condition — matches every request that reaches this flow.'}
            </div>
          </div>

          <div className="flow-columns">
            <div>
              <div className="flow-block-title">
                <Icon name="arrow-right" size={12} /> Request
              </div>
              <StepList location={stepLocation(flow.id, 'request')} steps={flow.request} />
            </div>
            <div>
              <div className="flow-block-title">
                <Icon name="arrow-left" size={12} /> Response
              </div>
              <StepList location={stepLocation(flow.id, 'response')} steps={flow.response} />
            </div>
          </div>
          </div>
          )}
        </div>
        );
      })}

      {/* Twin of the sticky bar's button: once you have read to the end of the
          list, the next flow belongs right here. */}
      {flows.length > 0 && (
        <button type="button" className="flow-add-row" onClick={handleAdd}>
          <Icon name="plus" size={14} /> Add Flow
        </button>
      )}
    </div>
  );
}
