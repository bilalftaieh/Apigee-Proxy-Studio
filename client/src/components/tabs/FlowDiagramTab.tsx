import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Icon } from '../Icon';
import { effectiveTarget } from '../../lib/proxyEnvironment';
import { lintPolicyXml } from '../../lib/fastLint';
import { traceRequest, type TraceResult } from '../../lib/flowTrace';
import { downloadBlob, nodeToPngBlob } from '../../lib/diagramExport';
import type { ConditionVerb, FaultRules, Flow, Policy, ProxyEnvironment, Step, Target } from '../../types/proxy';

const TRACE_VERBS: ConditionVerb[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

/**
 * A concrete path that would match this flow, for seeding the tracer when the
 * user clicks a flow row. Template segments become a stand-in value — the
 * point is to land inside the flow, and the path stays editable afterwards.
 */
function sampleRequestFor(flow: Flow): { verb: string; path: string } | null {
  if (flow.conditionMode !== 'simple' || !flow.pathValue) return null;
  const path = flow.pathValue
    .replace(/\{[^/{}]*\}/g, '1')
    .replace(/\*\*/g, 'a/b')
    .replace(/\*/g, 'a');
  return { verb: flow.verb && flow.verb !== 'ANY' ? flow.verb : 'GET', path };
}

interface EdgeDef {
  id: string;
  from: string;
  to: string;
  tone: 'neutral' | 'route' | 'condition' | 'backend';
  label?: string;
  /** Full text shown on hover — route rule conditions are truncated to their name on the edge itself. */
  title?: string;
}

interface EdgePath {
  id: string;
  d: string;
  tone: EdgeDef['tone'];
  label?: string;
  title?: string;
  labelX: number;
  labelY: number;
}

function backendLabel(target: Target): string {
  const pathPart = target.path?.value
    ? ` · path: ${target.path.mode === 'variable' ? `{${target.path.value}}` : target.path.value}`
    : '';
  if (target.mode === 'targetServer') {
    const servers = target.targetServers.length > 0 ? target.targetServers.join(', ') : 'No target servers set';
    return `${servers}${pathPart}`;
  }
  const v = target.url;
  if (!v || !v.value) return 'No URL set';
  return `${v.mode === 'variable' ? `{${v.value}}` : v.value}${pathPart}`;
}

function stepNames(steps: Step[]): string[] {
  return steps.map((s) => s.policyName);
}

/**
 * Every policy name referenced anywhere in a ProxyEndpoint's or TargetEndpoint's
 * own flows. Includes the response-only flows (PostClientFlow on a proxy,
 * EventFlow on a target) so a policy attached only there still contributes to
 * the node's lint dot instead of looking unreferenced.
 */
function allReferencedPolicyNames(node: {
  preFlow: { request: Step[]; response: Step[] };
  postFlow: { request: Step[]; response: Step[] };
  postClientFlow?: { response: Step[] };
  eventFlow?: { response: Step[] };
  flows: Flow[];
  faultRules: FaultRules;
}): string[] {
  const names = new Set<string>();
  [
    node.preFlow.request,
    node.preFlow.response,
    node.postFlow.request,
    node.postFlow.response,
    node.postClientFlow?.response ?? [],
    node.eventFlow?.response ?? [],
    node.faultRules.steps,
  ].forEach((list) => list.forEach((s) => names.add(s.policyName)));
  node.flows.forEach((f) => [f.request, f.response].forEach((list) => list.forEach((s) => names.add(s.policyName))));
  // Conditional fault rules count too — a policy attached only to one of them
  // is referenced, and its lint issues belong on this node's dot.
  (node.faultRules.rules ?? []).forEach((r) => r.steps.forEach((s) => names.add(s.policyName)));
  return Array.from(names);
}

/** Worst fast-lint severity among the named policies, or null if none/clean. Reuses the same checks as the Policies tab's inline lint. */
function worstLintSeverity(policyNames: string[], policies: Policy[]): 'warning' | 'info' | null {
  let worst: 'warning' | 'info' | null = null;
  for (const name of policyNames) {
    const policy = policies.find((p) => p.name === name);
    if (!policy) continue;
    const issues = lintPolicyXml(policy.xml, policy.name);
    if (issues.some((i) => i.severity === 'warning')) return 'warning';
    if (issues.length) worst = 'info';
  }
  return worst;
}

function LintDot({ severity }: { severity: 'warning' | 'info' | null }) {
  if (!severity) return null;
  return (
    <span
      className={`fd-lint-dot fd-lint-dot-${severity}`}
      title={severity === 'warning' ? 'Fast-lint found issues among these policies — see the Policies tab.' : 'Fast-lint has suggestions among these policies — see the Policies tab.'}
    />
  );
}

function FlowStage({ icon, title, request, response }: { icon: string; title: string; request: Step[]; response: Step[] }) {
  if (request.length === 0 && response.length === 0) return null;
  return (
    <div className="fd-stage">
      <Icon name={icon} size={11} />
      <span>{title}</span>
      {request.length > 0 && (
        <span className="fd-stage-count" title={`Request: ${stepNames(request).join(', ')}`}>
          <Icon name="arrow-right" size={9} /> {request.length}
        </span>
      )}
      {response.length > 0 && (
        <span className="fd-stage-count" title={`Response: ${stepNames(response).join(', ')}`}>
          <Icon name="arrow-left" size={9} /> {response.length}
        </span>
      )}
    </div>
  );
}

// Both halves of fault handling in one strip. The label stays short so it can't
// widen a diagram node — the per-rule detail lives in the tooltip instead.
function FaultRuleMini({ faultRules }: { faultRules: FaultRules }) {
  const rules = faultRules.rules ?? [];
  const totalSteps = faultRules.steps.length + rules.reduce((n, r) => n + r.steps.length, 0);
  if (totalSteps === 0 && rules.length === 0) return null;

  const lines = rules.map(
    (r) => `${r.name} [${r.condition || 'always matches'}]: ${stepNames(r.steps).join(', ') || 'no steps'}`
  );
  if (faultRules.steps.length) lines.push(`Default: ${stepNames(faultRules.steps).join(', ')}`);

  return (
    <div className="fd-faultrule" title={`Runs on error —\n${lines.join('\n')}`}>
      <Icon name="octagon-alert" size={11} />
      <span>{rules.length ? 'Fault Rules' : 'Fault Rule'}</span>
      <span className="fd-stage-count fd-faultrule-count">{totalSteps}</span>
    </div>
  );
}

function ConditionalFlowsMini({
  flows,
  matchedFlowId,
  tracing,
  onTrace,
}: {
  flows: Flow[];
  matchedFlowId?: string | null;
  tracing: boolean;
  onTrace: (flow: Flow) => void;
}) {
  if (flows.length === 0) return null;
  return (
    <div className="fd-subflows">
      {flows.map((f, i) => {
        const isEnabled = f.enabled !== false;
        const sample = isEnabled ? sampleRequestFor(f) : null;
        const matched = matchedFlowId === f.id;
        const classes = [
          'fd-subflow-row',
          isEnabled ? '' : 'fd-subflow-row-disabled',
          tracing && matched ? 'fd-subflow-row-matched' : '',
          tracing && !matched ? 'fd-subflow-row-muted' : '',
          sample ? 'fd-subflow-row-traceable' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            className={classes}
            key={f.id}
            title={
              !isEnabled
                ? 'Parked — excluded from the exported bundle'
                : sample
                ? `Trace a ${sample.verb} ${sample.path} request through this flow`
                : 'This flow uses a custom condition, so a sample request can’t be derived from it'
            }
            onClick={
              sample
                ? (e) => {
                    // The node itself jumps to its tab — a flow row means "trace this".
                    e.stopPropagation();
                    onTrace(f);
                  }
                : undefined
            }
          >
            <span className="fd-subflow-index">{i + 1}</span>
            <span className="fd-subflow-name">{f.name}</span>
            {isEnabled && f.conditionMode === 'simple' && f.verb && f.verb !== 'ANY' && <span className="fd-verb-badge">{f.verb}</span>}
            {!isEnabled && <Icon name="moon" size={9} />}
            <span className="fd-subflow-cond" title={f.condition}>
              {isEnabled ? f.condition || 'always matches' : 'parked'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TraceTimeline({ trace, onOpenPolicy }: { trace: TraceResult; onOpenPolicy: (name: string) => void }) {
  const total = trace.stages.reduce((n, s) => n + s.steps.filter((p) => p.active !== false).length, 0);
  return (
    <div className="card fd-timeline">
      <h4 className="card-title">
        <Icon name="list-ordered" size={15} /> Execution order
        <span className="fd-timeline-count">
          {total} polic{total === 1 ? 'y' : 'ies'} run
        </span>
      </h4>
      <p className="card-subtitle">
        Every stage a <strong className="mono">{trace.verb}</strong> request to{' '}
        <strong className="mono">{trace.pathSuffix}</strong> passes through, in order. Click a policy to open it.
      </p>

      {trace.problems.map((problem) => (
        <div className="fd-warning" key={problem}>
          <Icon name="triangle-alert" size={13} /> {problem}
        </div>
      ))}

      <ol className="fd-timeline-list">
        {trace.stages.map((stage) => (
          <li className={`fd-timeline-stage fd-timeline-${stage.phase}`} key={stage.id}>
            <div className="fd-timeline-head">
              <span className={`fd-timeline-dot fd-timeline-dot-${stage.scope}`} />
              <span className="fd-timeline-label">{stage.label}</span>
              <span className="fd-timeline-phase">{stage.phase === 'route' ? 'route' : stage.phase}</span>
            </div>
            {stage.note && <div className="fd-timeline-note">{stage.note}</div>}
            {stage.steps.length > 0 && (
              <div className="fd-timeline-steps">
                {stage.steps.map((step, i) => (
                  <button
                    type="button"
                    key={`${step.policyName}-${i}`}
                    className={`fd-timeline-step ${step.active === false ? 'fd-timeline-step-skipped' : ''} ${
                      step.active === 'unknown' ? 'fd-timeline-step-maybe' : ''
                    }`}
                    onClick={() => onOpenPolicy(step.policyName)}
                    title={
                      step.active === false
                        ? `Skipped — its condition (${step.condition}) is false for this request`
                        : step.active === 'unknown'
                        ? `Runs only if: ${step.condition}`
                        : `Open ${step.policyName}`
                    }
                  >
                    {step.active === false && <Icon name="circle-slash" size={10} />}
                    {step.active === 'unknown' && <Icon name="circle-help" size={10} />}
                    {step.policyName}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FlowDiagramTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setSelectedTargetId = useStore((s) => s.setSelectedTargetId);
  const selectedEnvironmentId = useStore((s) => s.selectedEnvironmentId);

  const setSelectedPolicyId = useStore((s) => s.setSelectedPolicyId);
  const pushToast = useStore((s) => s.pushToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [paths, setPaths] = useState<EdgePath[]>([]);

  const [tracing, setTracing] = useState(false);
  const [traceVerb, setTraceVerb] = useState<string>('GET');
  const [tracePath, setTracePath] = useState('/');
  const [exporting, setExporting] = useState(false);

  const trace = useMemo(
    () => (tracing ? traceRequest(proxy, traceVerb, tracePath) : null),
    [tracing, traceVerb, tracePath, proxy]
  );
  const tracedNodes = useMemo(() => new Set(trace?.nodeIds ?? []), [trace]);
  const tracedEdges = useMemo(() => new Set(trace?.edgeIds ?? []), [trace]);

  const startTrace = (flow: Flow) => {
    const sample = sampleRequestFor(flow);
    if (!sample) return;
    setTraceVerb(sample.verb);
    setTracePath(sample.path);
    setTracing(true);
  };

  const openPolicy = (name: string) => {
    const policy = proxy.policies.find((p) => p.name === name);
    if (!policy) {
      pushToast(`"${name}" is referenced by a flow but isn't defined in this proxy.`, 'error');
      return;
    }
    setSelectedPolicyId(policy.id);
    setActiveTab('policies');
  };

  const exportPng = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const background = getComputedStyle(document.body).getPropertyValue('--bg-0').trim() || '#0a0c12';
      const blob = await nodeToPngBlob(cardRef.current, { background });
      downloadBlob(blob, `${proxy.name || 'proxy'}-flow-diagram.png`);
      pushToast('Flow diagram exported as PNG.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'The diagram could not be exported.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const selectedEnv: ProxyEnvironment | undefined = proxy.environments.find((e) => e.id === selectedEnvironmentId);
  const displayTargets = useMemo(
    () => proxy.targets.map((t) => effectiveTarget(t, selectedEnv)),
    [proxy.targets, selectedEnv]
  );

  const proxyLintSeverity = useMemo(
    () => worstLintSeverity(allReferencedPolicyNames(proxy), proxy.policies),
    [proxy.preFlow, proxy.postFlow, proxy.flows, proxy.faultRules, proxy.policies]
  );

  const missingTargetNames = useMemo(() => {
    const known = new Set(proxy.targets.map((t) => t.name));
    const missing = new Set<string>();
    proxy.routeRules.forEach((rr) => {
      if (rr.targetName && !known.has(rr.targetName)) missing.add(rr.targetName);
    });
    return Array.from(missing);
  }, [proxy.targets, proxy.routeRules]);

  const edgeDefs = useMemo<EdgeDef[]>(() => {
    const list: EdgeDef[] = [{ id: 'client-proxy', from: 'client', to: 'proxy', tone: 'neutral' }];
    proxy.routeRules.forEach((rr) => {
      const target = proxy.targets.find((t) => t.name === rr.targetName);
      const to = target ? `target-${target.id}` : rr.targetName ? `missing-${rr.targetName}` : '';
      if (!to) return;
      list.push({
        id: `route-${rr.id}`,
        from: 'proxy',
        to,
        tone: rr.condition ? 'condition' : 'route',
        label: rr.condition ? rr.name : undefined,
        title: rr.condition ? `${rr.name}: ${rr.condition}` : `${rr.name} (always matches)`,
      });
    });
    proxy.targets.forEach((t) => {
      list.push({ id: `backend-${t.id}`, from: `target-${t.id}`, to: `backend-${t.id}`, tone: 'backend' });
    });
    return list;
  }, [proxy.routeRules, proxy.targets]);

  /** Dims everything the traced request never touches, so the path pops out. */
  const nodeClass = (id: string) => (tracing ? (tracedNodes.has(id) ? 'fd-node-traced' : 'fd-node-muted') : '');

  const setNodeRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const containerRect = container.getBoundingClientRect();
      const next: EdgePath[] = [];
      edgeDefs.forEach((edge) => {
        const fromEl = nodeRefs.current.get(edge.from);
        const toEl = nodeRefs.current.get(edge.to);
        if (!fromEl || !toEl) return;
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const x1 = fromRect.right - containerRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
        const x2 = toRect.left - containerRect.left;
        const y2 = toRect.top + toRect.height / 2 - containerRect.top;
        const offset = Math.max(36, (x2 - x1) * 0.5);
        next.push({
          id: edge.id,
          d: `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`,
          tone: edge.tone,
          label: edge.label,
          title: edge.title,
          labelX: (x1 + x2) / 2,
          labelY: (y1 + y2) / 2,
        });
      });
      setPaths(next);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    nodeRefs.current.forEach((el) => ro.observe(el));
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [edgeDefs, proxy]);

  return (
    <div>
      <div className="card">
        <div className="row-between">
          <div>
            <h4 className="card-title">
              <Icon name="workflow" size={15} /> Flow Diagram
            </h4>
            <p className="card-subtitle" style={{ marginBottom: 0 }}>
              Live view of how a request travels from the caller through this proxy to its target endpoint(s). Click a
              node to jump to that tab, or a conditional flow to trace it.
            </p>
          </div>
          <button className="btn btn-sm" onClick={exportPng} disabled={exporting} title="Save the diagram as a PNG image">
            {exporting ? <span className="spinner" /> : <Icon name="image-down" size={14} />}
            {exporting ? 'Rendering…' : 'Export PNG'}
          </button>
        </div>

        <div className="fd-tracebar">
          <span className="fd-tracebar-title">
            <Icon name="route" size={13} /> Trace a request
          </span>
          <select value={traceVerb} onChange={(e) => setTraceVerb(e.target.value)} aria-label="Request verb to trace">
            {TRACE_VERBS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <span className="fd-tracebar-basepath mono">{proxy.basePath || ''}</span>
          <input
            className="mono"
            value={tracePath}
            onChange={(e) => setTracePath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setTracing(true)}
            placeholder="/path/suffix"
            aria-label="Path suffix to trace"
          />
          <button className={`btn btn-sm ${tracing ? '' : 'btn-primary'}`} onClick={() => setTracing(true)}>
            <Icon name="play" size={13} /> Trace
          </button>
          {tracing && (
            <button className="btn btn-sm btn-ghost" onClick={() => setTracing(false)}>
              <Icon name="x" size={13} /> Clear
            </button>
          )}
          <span className="fd-tracebar-hint">
            Resolved from path and verb only — anything that depends on a runtime variable is marked, never guessed.
          </span>
        </div>
      </div>

      {proxy.routeRules.length === 0 && (
        <div className="fd-warning">
          <Icon name="triangle-alert" size={13} /> No route rules configured — requests will never reach a target
          endpoint.
        </div>
      )}
      {missingTargetNames.length > 0 && (
        <div className="fd-warning">
          <Icon name="triangle-alert" size={13} /> Route rule targets not found: {missingTargetNames.join(', ')}
        </div>
      )}
      {selectedEnv && (
        <div className="fd-env-banner">
          <Icon name="layers" size={13} /> Showing backend config for environment <strong>{selectedEnv.name}</strong> — targets
          without an override here still show their base values.
        </div>
      )}

      <div className="card fd-card" ref={cardRef}>
        <div className={`fd-canvas ${tracing ? 'fd-canvas-tracing' : ''}`} ref={containerRef}>
          <svg className="fd-edges">
            <defs>
              <marker id="fd-arrow-neutral" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-3)" />
              </marker>
              <marker id="fd-arrow-route" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent-teal)" />
              </marker>
              <marker id="fd-arrow-condition" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent-purple)" />
              </marker>
              <marker id="fd-arrow-backend" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent-blue)" />
              </marker>
            </defs>
            {paths.map((p) => (
              <g key={p.id} className={tracing ? (tracedEdges.has(p.id) ? 'fd-edge-traced' : 'fd-edge-muted') : undefined}>
                {p.title && <title>{p.title}</title>}
                <path d={p.d} className={`fd-edge-path fd-edge-${p.tone}`} markerEnd={`url(#fd-arrow-${p.tone})`} />
                {/* Second pass over the same curve: a dashed overlay that runs
                    along the traced route, so the direction of travel reads at
                    a glance instead of having to follow the arrowheads. */}
                {tracing && tracedEdges.has(p.id) && <path d={p.d} className="fd-edge-flow" />}
                {p.label && (
                  <text x={p.labelX} y={p.labelY - 8} textAnchor="middle" className="fd-edge-label">
                    {p.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          <div className="fd-col fd-col-client">
            <div className={`fd-node fd-node-client ${nodeClass('client')}`} ref={setNodeRef('client')}>
              <Icon name="globe" size={16} />
              <span>Client</span>
            </div>
          </div>

          <div className="fd-col fd-col-proxy">
            <div
              className={`fd-node fd-node-proxy ${nodeClass('proxy')}`}
              ref={setNodeRef('proxy')}
              onClick={() => setActiveTab('proxyEndpoint')}
              title="Open Proxy Endpoint tab"
            >
              <div className="fd-node-head">
                <Icon name="signpost" size={14} />
                <span>{proxy.proxyEndpointName || 'default'}</span>
                <LintDot severity={proxyLintSeverity} />
              </div>
              <div className="fd-node-sub mono">{proxy.basePath || '/'}</div>
              <FlowStage icon="arrow-down-to-line" title="PreFlow" request={proxy.preFlow.request} response={proxy.preFlow.response} />
              <ConditionalFlowsMini
                flows={proxy.flows}
                matchedFlowId={trace?.proxyFlow?.id ?? null}
                tracing={tracing}
                onTrace={startTrace}
              />
              <FlowStage icon="arrow-up-from-line" title="PostFlow" request={proxy.postFlow.request} response={proxy.postFlow.response} />
              {/* Response-only, and it runs after the client already has the
                  response — so it's shown last, with no request column. */}
              {(proxy.postClientFlow?.response?.length ?? 0) > 0 && (
                <FlowStage
                  icon="send-horizontal"
                  title="PostClientFlow"
                  request={[]}
                  response={proxy.postClientFlow!.response}
                />
              )}
              <FaultRuleMini faultRules={proxy.faultRules} />
            </div>
          </div>

          <div className="fd-col fd-col-targets">
            {displayTargets.map((t) => {
              const lintSeverity = worstLintSeverity(allReferencedPolicyNames(t), proxy.policies);
              const overridden = !!selectedEnv?.targetOverrides?.[t.id];
              return (
                <div
                  className={`fd-node fd-node-target ${nodeClass(`target-${t.id}`)}`}
                  key={t.id}
                  ref={setNodeRef(`target-${t.id}`)}
                  onClick={() => {
                    setSelectedTargetId(t.id);
                    setActiveTab('targetEndpoint');
                  }}
                  title="Open Target Endpoint tab"
                >
                  <div className="fd-node-head">
                    <Icon name="server" size={14} />
                    <span>{t.name}</span>
                    {overridden && (
                      <span className="fd-env-badge" title={`Overridden for environment "${selectedEnv!.name}"`}>
                        {selectedEnv!.name}
                      </span>
                    )}
                    <LintDot severity={lintSeverity} />
                  </div>
                  <FlowStage icon="arrow-down-to-line" title="PreFlow" request={t.preFlow.request} response={t.preFlow.response} />
                  <ConditionalFlowsMini
                    flows={t.flows}
                    matchedFlowId={trace?.target?.id === t.id ? trace?.targetFlow?.id ?? null : null}
                    tracing={tracing}
                    onTrace={startTrace}
                  />
                  <FlowStage icon="arrow-up-from-line" title="PostFlow" request={t.postFlow.request} response={t.postFlow.response} />
                  {(t.eventFlow?.response?.length ?? 0) > 0 && (
                    <FlowStage icon="radio-tower" title="EventFlow (SSE)" request={[]} response={t.eventFlow!.response} />
                  )}
                  <FaultRuleMini faultRules={t.faultRules} />
                </div>
              );
            })}
            {missingTargetNames.map((name) => (
              <div className="fd-node fd-node-ghost" key={name} ref={setNodeRef(`missing-${name}`)}>
                <Icon name="triangle-alert" size={14} />
                <span>"{name}" not found</span>
              </div>
            ))}
            {proxy.targets.length === 0 && missingTargetNames.length === 0 && (
              <div className="fd-node fd-node-ghost">
                <Icon name="server-off" size={14} />
                <span>No targets yet</span>
              </div>
            )}
          </div>

          <div className="fd-col fd-col-backend">
            {displayTargets.map((t) => (
              <div className={`fd-node fd-node-backend ${nodeClass(`backend-${t.id}`)}`} key={t.id} ref={setNodeRef(`backend-${t.id}`)}>
                <Icon name="database" size={13} />
                <span className="mono">{backendLabel(t)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {trace && <TraceTimeline trace={trace} onOpenPolicy={openPolicy} />}

      <div className="fd-legend">
        <span>
          <i className="fd-legend-swatch fd-legend-neutral" /> Client traffic
        </span>
        <span>
          <i className="fd-legend-swatch fd-legend-route" /> Unconditional route
        </span>
        <span>
          <i className="fd-legend-swatch fd-legend-condition" /> Conditional route
        </span>
        <span>
          <i className="fd-legend-swatch fd-legend-backend" /> Backend call
        </span>
        <span>
          <Icon name="octagon-alert" size={11} color="var(--error)" /> Fault rule (runs on error)
        </span>
        <span>
          <i className="fd-legend-swatch fd-legend-dot fd-lint-dot-warning" /> Fast-lint issue
        </span>
        <span>
          <i className="fd-legend-swatch fd-legend-dot fd-lint-dot-info" /> Fast-lint suggestion
        </span>
      </div>
    </div>
  );
}
