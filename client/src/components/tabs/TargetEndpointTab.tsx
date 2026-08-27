import { useStore } from '../../store/useStore';
import { Icon } from '../Icon';
import { StepList } from '../StepList';
import { VarValueInput } from '../VarValueInput';
import { TargetServerChips } from '../TargetServerChips';
import { ConditionalFlowsSection } from '../ConditionalFlowsSection';
import { FaultRulesSection } from '../FaultRulesSection';
import type { TargetAuthMode } from '../../types/proxy';

export function TargetEndpointTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const selectedTargetId = useStore((s) => s.selectedTargetId);
  const setSelectedTargetId = useStore((s) => s.setSelectedTargetId);
  const addTarget = useStore((s) => s.addTarget);
  const updateTarget = useStore((s) => s.updateTarget);
  const removeTarget = useStore((s) => s.removeTarget);
  const addFlow = useStore((s) => s.addFlow);
  const updateFlow = useStore((s) => s.updateFlow);
  const removeFlow = useStore((s) => s.removeFlow);
  const moveFlow = useStore((s) => s.moveFlow);
  const addFaultRule = useStore((s) => s.addFaultRule);
  const updateFaultRule = useStore((s) => s.updateFaultRule);
  const removeFaultRule = useStore((s) => s.removeFaultRule);
  const moveFaultRule = useStore((s) => s.moveFaultRule);

  const target = proxy.targets.find((t) => t.id === selectedTargetId) || proxy.targets[0];

  if (!target) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
        <Icon name="server" size={26} color="var(--text-3)" />
        <h4 style={{ margin: '14px 0 6px' }}>No target endpoints yet</h4>
        <p className="card-subtitle" style={{ margin: '0 0 18px' }}>
          A proxy needs at least one target endpoint to route traffic to.
        </p>
        <button className="btn btn-primary" style={{ margin: '0 auto' }} onClick={addTarget}>
          <Icon name="plus" size={14} /> Add Target
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {proxy.targets.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${t.id === target.id ? 'btn-primary' : ''}`}
            onClick={() => setSelectedTargetId(t.id)}
          >
            <Icon name="server" size={12} /> {t.name}
          </button>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={addTarget}>
          <Icon name="plus" size={12} /> Add Target
        </button>
      </div>

      <div className="phase-strip">
        <span className="phase-strip-item dim">Reached via a matching Route Rule</span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge pre">1</span> PreFlow
        </span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge flows">2</span> Conditional Flows
        </span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge post">3</span> PostFlow
        </span>
        <span className="phase-strip-item dim">Fault Rule runs instead, on error</span>
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 4 }}>
          <div>
            <h4 className="card-title">
              <Icon name="server" size={15} /> {target.name} · Target Endpoint
            </h4>
            <p className="card-subtitle">
              Route to a full URL, or load-balance across named Target Server entities already configured in your
              Apigee X environment.
            </p>
          </div>
          <button
            className="icon-btn"
            onClick={() => removeTarget(target.id)}
            disabled={proxy.targets.length <= 1}
            aria-label="Remove target"
          >
            <Icon name="trash-2" size={14} />
          </button>
        </div>

        <div className="target-config-field">
          <label>Target Name</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ width: 200, fontFamily: 'var(--font-mono)' }}
              value={target.name}
              onChange={(e) => updateTarget(target.id, { name: e.target.value })}
              placeholder="name"
            />
            <div className="mode-toggle">
              <button
                type="button"
                className={target.mode === 'url' ? 'active' : ''}
                onClick={() => updateTarget(target.id, { mode: 'url' })}
              >
                URL
              </button>
              <button
                type="button"
                className={target.mode === 'targetServer' ? 'active' : ''}
                onClick={() => updateTarget(target.id, { mode: 'targetServer' })}
              >
                Target Server
              </button>
            </div>
          </div>
        </div>

        <div className="target-config-field">
          <label>Backend</label>
          {target.mode === 'url' ? (
            <VarValueInput
              value={target.url}
              onChange={(url) => updateTarget(target.id, { url })}
              placeholder="https://backend.example.com"
            />
          ) : (
            <TargetServerChips value={target.targetServers} onChange={(targetServers) => updateTarget(target.id, { targetServers })} />
          )}
        </div>

        <div className="target-config-field">
          <label>Path (optional)</label>
          <VarValueInput
            value={target.path || { mode: 'literal', value: '' }}
            onChange={(path) => updateTarget(target.id, { path })}
            placeholder="/v1"
          />
        </div>
      </div>

      <div className="card">
        <h4 className="card-title">
          <Icon name="lock" size={15} /> TLS (SSLInfo)
        </h4>
        <p className="card-subtitle">
          Controls the TLS leg between Apigee and this backend. Leave enabled for any <code className="mono">https</code>{' '}
          target — apigeelint flags an https target without it. It is skipped automatically for a plain{' '}
          <code className="mono">http</code> URL, where Apigee rejects it.
        </p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={target.sslInfo?.enabled ?? false}
            onChange={(e) =>
              updateTarget(target.id, {
                sslInfo: { ...(target.sslInfo ?? {}), enabled: e.target.checked },
              })
            }
          />
          Enable TLS
        </label>
        {target.sslInfo?.enabled && (
          <>
            <div className="target-config-field">
              <label>Trust Store (optional)</label>
              <input
                style={{ fontFamily: 'var(--font-mono)' }}
                value={target.sslInfo.trustStore || ''}
                onChange={(e) =>
                  updateTarget(target.id, { sslInfo: { ...target.sslInfo!, trustStore: e.target.value } })
                }
                placeholder="ref://my-truststore-ref"
              />
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!target.sslInfo.clientAuthEnabled}
                onChange={(e) =>
                  updateTarget(target.id, { sslInfo: { ...target.sslInfo!, clientAuthEnabled: e.target.checked } })
                }
              />
              Client auth (mTLS)
            </label>
            {target.sslInfo.clientAuthEnabled && (
              <div className="flow-columns">
                <div className="target-config-field">
                  <label>Key Store</label>
                  <input
                    style={{ fontFamily: 'var(--font-mono)' }}
                    value={target.sslInfo.keyStore || ''}
                    onChange={(e) =>
                      updateTarget(target.id, { sslInfo: { ...target.sslInfo!, keyStore: e.target.value } })
                    }
                    placeholder="ref://my-keystore-ref"
                  />
                </div>
                <div className="target-config-field">
                  <label>Key Alias</label>
                  <input
                    style={{ fontFamily: 'var(--font-mono)' }}
                    value={target.sslInfo.keyAlias || ''}
                    onChange={(e) =>
                      updateTarget(target.id, { sslInfo: { ...target.sslInfo!, keyAlias: e.target.value } })
                    }
                    placeholder="my-key-alias"
                  />
                </div>
              </div>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!target.sslInfo.ignoreValidationErrors}
                onChange={(e) =>
                  updateTarget(target.id, {
                    sslInfo: { ...target.sslInfo!, ignoreValidationErrors: e.target.checked },
                  })
                }
              />
              Ignore validation errors <span className="field-hint">— skips cert checks; never do this in production</span>
            </label>
          </>
        )}
      </div>

      <div className="card">
        <h4 className="card-title">
          <Icon name="key-round" size={15} /> Google Authentication
        </h4>
        <p className="card-subtitle">
          Has Apigee mint a Google credential for the outbound call, so this proxy can reach an IAM-protected GCP
          backend without holding a secret. Use an <strong>ID token</strong> for a service like Cloud Run or Cloud
          Functions, and an <strong>access token</strong> for a Google API. The deployment service account needs
          permission on the target.
        </p>
        <div className="target-config-field">
          <label>Credential</label>
          <select
            value={target.authentication?.mode || 'none'}
            onChange={(e) =>
              updateTarget(target.id, {
                authentication: { ...(target.authentication ?? {}), mode: e.target.value as TargetAuthMode },
              })
            }
          >
            <option value="none">None</option>
            <option value="googleIdToken">Google ID token (Cloud Run, Cloud Functions)</option>
            <option value="googleAccessToken">Google access token (Google APIs)</option>
          </select>
        </div>
        {target.authentication?.mode === 'googleIdToken' && (
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!target.authentication.useTargetUrl}
                onChange={(e) =>
                  updateTarget(target.id, {
                    authentication: { ...target.authentication!, useTargetUrl: e.target.checked },
                  })
                }
              />
              Use the target URL as the audience
            </label>
            {!target.authentication.useTargetUrl && (
              <div className="target-config-field">
                <label>Audience</label>
                <VarValueInput
                  value={target.authentication.audience || { mode: 'literal', value: '' }}
                  onChange={(audience) =>
                    updateTarget(target.id, { authentication: { ...target.authentication!, audience } })
                  }
                  placeholder="https://my-service-abc123.a.run.app"
                />
              </div>
            )}
          </>
        )}
        {target.authentication?.mode === 'googleAccessToken' && (
          <div className="target-config-field">
            <label>Scopes</label>
            <TargetServerChips
              value={target.authentication.scopes || []}
              onChange={(scopes) => updateTarget(target.id, { authentication: { ...target.authentication!, scopes } })}
            />
            <span className="field-hint">
              Defaults to https://www.googleapis.com/auth/cloud-platform when left empty.
            </span>
          </div>
        )}
        {target.authentication?.mode && target.authentication.mode !== 'none' && (
          <div className="target-config-field">
            <label>Header name (optional)</label>
            <input
              style={{ fontFamily: 'var(--font-mono)' }}
              value={target.authentication.headerName || ''}
              onChange={(e) =>
                updateTarget(target.id, { authentication: { ...target.authentication!, headerName: e.target.value } })
              }
              placeholder="Authorization"
            />
            <span className="field-hint">
              Cloud Run behind IAP expects X-Serverless-Authorization instead of the default Authorization.
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <h4 className="card-title">
          <span className="phase-badge pre">1</span>
          <Icon name="arrow-down-to-line" size={15} /> PreFlow
        </h4>
        <p className="card-subtitle">Runs right before calling the backend — attach headers, sign requests, etc.</p>
        <div className="flow-columns">
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-right" size={12} /> Request
            </div>
            <StepList location={{ scope: 'targetPreFlow', targetId: target.id, phase: 'request' }} steps={target.preFlow.request} />
          </div>
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-left" size={12} /> Response
            </div>
            <StepList location={{ scope: 'targetPreFlow', targetId: target.id, phase: 'response' }} steps={target.preFlow.response} />
          </div>
        </div>
      </div>

      <ConditionalFlowsSection
        flows={target.flows}
        onAdd={() => addFlow(target.id)}
        onUpdate={(id, patch) => updateFlow(id, patch, target.id)}
        onRemove={(id) => removeFlow(id, target.id)}
        onMove={(id, dir) => moveFlow(id, dir, target.id)}
        stepLocation={(flowId, phase) => ({ scope: 'targetFlow', targetId: target.id, flowId, phase })}
        emptyHint="No conditional flows on this target — every request uses PreFlow → PostFlow as-is."
        phaseNumber={2}
      />

      <div className="card">
        <h4 className="card-title">
          <span className="phase-badge post">3</span>
          <Icon name="arrow-up-from-line" size={15} /> PostFlow
        </h4>
        <p className="card-subtitle">Runs right after the backend responds, before control returns to the ProxyEndpoint.</p>
        <div className="flow-columns">
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-right" size={12} /> Request
            </div>
            <StepList location={{ scope: 'targetPostFlow', targetId: target.id, phase: 'request' }} steps={target.postFlow.request} />
          </div>
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-left" size={12} /> Response
            </div>
            <StepList location={{ scope: 'targetPostFlow', targetId: target.id, phase: 'response' }} steps={target.postFlow.response} />
          </div>
        </div>
      </div>

      <div className="card">
        <h4 className="card-title">
          <Icon name="radio-tower" size={15} /> EventFlow (streaming / SSE)
        </h4>
        <p className="card-subtitle">
          For a backend that streams <code className="mono">text/event-stream</code> — an LLM, typically. Steps here run
          per server-sent event instead of once per response, which is the only way to count tokens on a streaming
          model: put an <strong>LLM Token Quota</strong> counting policy in Response. Leave empty for a normal
          request/response backend.
        </p>
        <div className="target-config-field">
          <label>Content type</label>
          <input
            style={{ width: 240, fontFamily: 'var(--font-mono)' }}
            value={target.eventFlow?.contentType ?? 'text/event-stream'}
            onChange={(e) =>
              updateTarget(target.id, {
                eventFlow: { contentType: e.target.value, response: target.eventFlow?.response ?? [] },
              })
            }
          />
        </div>
        <div className="flow-block-title">
          <Icon name="arrow-left" size={12} /> Response
        </div>
        <StepList
          location={{ scope: 'targetEventFlow', targetId: target.id, phase: 'response' }}
          steps={target.eventFlow?.response ?? []}
        />
      </div>

      <FaultRulesSection
        faultRules={target.faultRules}
        scopeLabel="this target endpoint"
        onAdd={() => addFaultRule(target.id)}
        onUpdate={(id, patch) => updateFaultRule(id, patch, target.id)}
        onRemove={(id) => removeFaultRule(id, target.id)}
        onMove={(id, direction) => moveFaultRule(id, direction, target.id)}
        ruleStepLocation={(ruleId) => ({ scope: 'targetFaultRule', targetId: target.id, ruleId, phase: 'steps' })}
        defaultStepLocation={{ scope: 'targetFaultRules', targetId: target.id, phase: 'steps' }}
      />
    </div>
  );
}
