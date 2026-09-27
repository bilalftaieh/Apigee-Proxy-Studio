import { useEffect, useRef, useState } from 'react';
import { StepList } from './StepList';
import { Icon } from './Icon';
import { Switch } from './Switch';
import { computeFlowCondition } from '../lib/condition';
import type { StepLocation } from '../store/useStore';
import type { ConditionVerb, Flow, PathOperator } from '../types/proxy';

const VERBS: ConditionVerb[] = ['ANY', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

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
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(false);
  const [stuck, setStuck] = useState(false);

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
     with it instead: scroll it into view, put the caret in its name, and tint
     the card briefly so it is obvious which one is new. */
  useEffect(() => {
    if (!jumpToNewRef.current) return;
    jumpToNewRef.current = false;
    const newest = flows[flows.length - 1];
    const card = newest && cardRefs.current[newest.id];
    if (!card) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    const nameInput = card.querySelector<HTMLInputElement>('input.flow-name');
    nameInput?.focus({ preventScroll: true });
    nameInput?.select();
    setJustAddedId(newest.id);
    const timer = setTimeout(() => setJustAddedId(null), 2200);
    return () => clearTimeout(timer);
  }, [flows.length]);

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
        <button className="btn btn-sm" onClick={handleAdd}>
          <Icon name="plus" size={13} /> Add Flow
        </button>
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
        return (
        <div
          className={`flow-card ${isEnabled ? '' : 'flow-card-disabled'} ${flow.id === justAddedId ? 'flow-card-new' : ''}`}
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
            <input className="flow-name" value={flow.name} onChange={(e) => onUpdate(flow.id, { name: e.target.value })} />
            <input
              className="flow-desc-input"
              placeholder="Optional description"
              value={flow.description || ''}
              onChange={(e) => onUpdate(flow.id, { description: e.target.value })}
            />
            <button className="icon-btn" onClick={() => onRemove(flow.id)} aria-label="Delete flow" title="Delete permanently">
              <Icon name="trash-2" size={14} />
            </button>
          </div>

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
