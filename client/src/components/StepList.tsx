import { useState } from 'react';
import { useStore, type StepLocation } from '../store/useStore';
import type { Step } from '../types/proxy';
import { Icon } from './Icon';

export function StepList({ location, steps }: { location: StepLocation; steps: Step[] }) {
  const proxy = useStore((s) => s.currentProxy)!;
  const addStep = useStore((s) => s.addStep);
  const updateStep = useStore((s) => s.updateStep);
  const removeStep = useStore((s) => s.removeStep);
  const moveStep = useStore((s) => s.moveStep);
  const setSelectedPolicyId = useStore((s) => s.setSelectedPolicyId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const [pending, setPending] = useState('');

  const availablePolicies = proxy.policies.map((p) => p.name);

  const jumpToPolicy = (policyName: string) => {
    const policy = proxy.policies.find((p) => p.name === policyName);
    if (!policy) return;
    setSelectedPolicyId(policy.id);
    setActiveTab('policies');
  };

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
                <button onClick={() => moveStep(location, i, -1)} disabled={i === 0} aria-label="Move up">
                  <Icon name="chevron-up" size={12} />
                </button>
                <button onClick={() => moveStep(location, i, 1)} disabled={i === steps.length - 1} aria-label="Move down">
                  <Icon name="chevron-down" size={12} />
                </button>
              </div>
              {availablePolicies.includes(step.policyName) ? (
                <button
                  type="button"
                  className="step-item-name step-item-name-link"
                  onClick={() => jumpToPolicy(step.policyName)}
                  title={`View policy "${step.policyName}"`}
                >
                  {step.policyName}
                </button>
              ) : (
                <span
                  className="step-item-name step-item-name-missing"
                  title={`Policy "${step.policyName}" does not exist in this proxy — this Step will fail to deploy.`}
                >
                  {step.policyName}
                </span>
              )}
              <button className="icon-btn" onClick={() => removeStep(location, i)} aria-label="Remove step">
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="step-condition-row">
              <Icon name="split" size={12} />
              <input
                className="condition-input step-condition-input"
                value={step.condition || ''}
                onChange={(e) => updateStep(location, i, { condition: e.target.value || undefined })}
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
              addStep(location, pending);
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
