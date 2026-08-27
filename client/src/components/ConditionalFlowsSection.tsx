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

  const activeCount = flows.filter((f) => f.enabled !== false).length;
  const inactiveCount = flows.length - activeCount;

  return (
    <div className="card">
      <div className="row-between">
        <div>
          <h4 className="card-title">
            {phaseNumber != null && <span className="phase-badge flows">{phaseNumber}</span>}
            <Icon name="git-fork" size={15} /> Conditional Flows
          </h4>
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
        </div>
        <button className="btn btn-sm" onClick={onAdd}>
          <Icon name="plus" size={13} /> Add Flow
        </button>
      </div>

      {flows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 2px' }}>{emptyHint}</div>}

      {flows.map((flow, i) => {
        const isEnabled = flow.enabled !== false;
        return (
        <div className={`flow-card ${isEnabled ? '' : 'flow-card-disabled'}`} key={flow.id}>
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
    </div>
  );
}
