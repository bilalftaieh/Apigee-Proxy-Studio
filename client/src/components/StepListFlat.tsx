import { useState } from 'react';
import { Icon } from './Icon';
import { policyCategory, policyAbbr } from '../lib/policyCategory';
import type { Step } from '../types/proxy';

export function StepListFlat({
  steps,
  availablePolicies,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onJumpToPolicy,
  resolvePolicyType,
}: {
  steps: Step[];
  availablePolicies: string[];
  onAdd: (policyName: string) => void;
  onUpdate: (index: number, patch: Partial<Step>) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  /** When provided, an attached policy's name becomes a link that jumps to it (e.g. selects it on the Policies tab). */
  onJumpToPolicy?: (policyName: string) => void;
  /**
   * Resolves a step's policy to its type so the row can show the category chip.
   * A prop rather than a store read because this list is shared between the
   * proxy editor and the shared-flow editor, which keep their policies in
   * different stores. Omitted: the rows simply have no chip.
   */
  resolvePolicyType?: (policyName: string) => string | undefined;
}) {
  const [pending, setPending] = useState('');

  return (
    <div>
      <div className="step-list">
        {steps.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', padding: '4px 2px' }}>No steps attached.</div>
        )}
        {steps.map((step, i) => (
          <div className="step-item" key={`${step.policyName}-${i}`}>
            <div className="step-item-main">
              <div className="step-order-btns">
                <button onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="Move up">
                  <Icon name="chevron-up" size={12} />
                </button>
                <button onClick={() => onMove(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">
                  <Icon name="chevron-down" size={12} />
                </button>
              </div>
              {/* Same chip as the policy list: the family, in the two
                  letters the name itself uses. A step row names a policy but
                  not its type, which meant reading a flow told you the order
                  of things and nothing about what they do. */}
              {(() => {
                const stepType = resolvePolicyType?.(step.policyName);
                if (!stepType) return null;
                return (
                  <span className="policy-cat" data-cat={policyCategory(stepType)} title={stepType}>
                    {policyAbbr(stepType)}
                  </span>
                );
              })()}
              {availablePolicies.includes(step.policyName) ? (
                onJumpToPolicy ? (
                  <button
                    type="button"
                    className="step-item-name step-item-name-link"
                    onClick={() => onJumpToPolicy(step.policyName)}
                    title={`View policy "${step.policyName}"`}
                  >
                    {step.policyName}
                  </button>
                ) : (
                  <span className="step-item-name">{step.policyName}</span>
                )
              ) : (
                <span
                  className="step-item-name step-item-name-missing"
                  title={`Policy "${step.policyName}" does not exist — this Step will fail to deploy.`}
                >
                  {step.policyName}
                </span>
              )}
              <button className="icon-btn" onClick={() => onRemove(i)} aria-label="Remove step">
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="step-condition-row">
              <Icon name="split" size={12} />
              <input
                className="condition-input step-condition-input"
                value={step.condition || ''}
                onChange={(e) => onUpdate(i, { condition: e.target.value || undefined })}
                placeholder='Condition (optional) — e.g. request.header.X-Env = "canary"'
              />
            </div>
          </div>
        ))}
      </div>
      {availablePolicies.length > 0 ? (
        <div className="step-add-row">
          <select value={pending} onChange={(e) => setPending(e.target.value)}>
            <option value="">Attach a policy…</option>
            {availablePolicies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            disabled={!pending}
            onClick={() => {
              if (!pending) return;
              onAdd(pending);
              setPending('');
            }}
          >
            <Icon name="plus" size={12} /> Attach
          </button>
        </div>
      ) : (
        <div className="field-hint" style={{ marginTop: 6 }}>
          Add a policy first, then attach it here.
        </div>
      )}
    </div>
  );
}
