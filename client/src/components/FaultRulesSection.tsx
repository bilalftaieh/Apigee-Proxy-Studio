import { StepList } from './StepList';
import { Icon } from './Icon';
import type { StepLocation } from '../store/useStore';
import type { FaultRule, FaultRules } from '../types/proxy';

/**
 * Fault handling for one endpoint — the conditional <FaultRule> list plus the
 * <DefaultFaultRule> fallback. Shared by the Proxy Endpoint and Target Endpoint
 * tabs, which differ only in which StepLocations they hand down.
 *
 * The two halves are deliberately shown in one card rather than two: their
 * meaning is relative to each other (the default only runs when no rule
 * matched), and splitting them made the fallback look like a separate feature.
 */
export function FaultRulesSection({
  faultRules,
  scopeLabel,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  ruleStepLocation,
  defaultStepLocation,
}: {
  faultRules: FaultRules;
  /** Reads as "…a step on {scopeLabel} raises a fault". */
  scopeLabel: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<FaultRule>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  ruleStepLocation: (ruleId: string) => StepLocation;
  defaultStepLocation: StepLocation;
}) {
  const rules = faultRules.rules ?? [];

  // Apigee stops at the first rule whose condition is true, and a blank
  // condition is always true — so a catch-all rule shadows everything below it,
  // the DefaultFaultRule included. Worth saying out loud: the bundle deploys
  // fine and the shadowed rules simply never run, which is hard to spot live.
  const catchAllIndex = rules.findIndex((r) => !r.condition?.trim());
  const hasShadowedRules = catchAllIndex >= 0 && catchAllIndex < rules.length - 1;

  return (
    <div className="card">
      <div className="row-between">
        <div>
          <h4 className="card-title">
            <span className="phase-badge fault">!</span>
            <Icon name="octagon-alert" size={15} /> Fault Handling
          </h4>
          <p className="card-subtitle">
            Runs instead of the rest of the pipeline when a step on {scopeLabel} raises a fault. Conditional rules are
            matched top-to-bottom and the <strong>first match wins</strong> — later rules don't run, and neither does
            the Default Fault Rule. When nothing matches, the Default Fault Rule runs.
          </p>
        </div>
        <button className="btn btn-sm" onClick={onAdd}>
          <Icon name="plus" size={13} /> Add Fault Rule
        </button>
      </div>

      {hasShadowedRules && (
        <div className="tier-callout">
          <Icon name="triangle-alert" size={14} />
          <span>
            <strong>"{rules[catchAllIndex].name}"</strong> has no condition, so it always matches — every rule below it
            is unreachable, as is the Default Fault Rule. Give it a condition, or move it to the bottom of the list.
          </span>
        </div>
      )}

      {rules.map((rule, i) => (
        <div className="flow-card" key={rule.id}>
          <div className="flow-card-head">
            <div className="flow-order-btns">
              <button className="icon-btn" onClick={() => onMove(rule.id, -1)} disabled={i === 0} aria-label="Move up">
                <Icon name="chevron-up" size={13} />
              </button>
              <button
                className="icon-btn"
                onClick={() => onMove(rule.id, 1)}
                disabled={i === rules.length - 1}
                aria-label="Move down"
              >
                <Icon name="chevron-down" size={13} />
              </button>
            </div>
            <input
              className="flow-name"
              value={rule.name}
              onChange={(e) => onUpdate(rule.id, { name: e.target.value })}
              aria-label="Fault rule name"
            />
            <button
              className="icon-btn"
              onClick={() => onRemove(rule.id)}
              aria-label={`Delete fault rule "${rule.name}"`}
              title="Delete permanently"
            >
              <Icon name="trash-2" size={14} />
            </button>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Condition</label>
            <input
              className="condition-input"
              placeholder={'Leave blank to catch everything — e.g. error.message = "Received non success response code"'}
              value={rule.condition || ''}
              onChange={(e) => onUpdate(rule.id, { condition: e.target.value })}
            />
          </div>

          <div className="flow-block-title">
            <Icon name="list-ordered" size={12} /> Steps
          </div>
          <StepList location={ruleStepLocation(rule.id)} steps={rule.steps} />
        </div>
      ))}

      <div className="flow-block-title" style={{ marginTop: rules.length ? 20 : 10 }}>
        <Icon name="shield" size={12} /> Default Fault Rule
        <span className="field-hint" style={{ fontWeight: 400, marginLeft: 8 }}>
          the fallback — runs only when no rule above matched
        </span>
      </div>
      <StepList location={defaultStepLocation} steps={faultRules.steps} />
    </div>
  );
}
