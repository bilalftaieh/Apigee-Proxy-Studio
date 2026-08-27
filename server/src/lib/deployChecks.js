import { extractResourcePaths } from './xmlImportUtils.js';

// Pre-flight checks for states that apigeelint passes but Apigee X cannot
// actually run. Each one produces a bundle that imports and deploys cleanly and
// then fails on every request — the worst failure mode, because the tooling all
// says "fine" and only a live call disagrees.
//
// These surface as errors in the lint result (so the Lint tab lists them and
// the existing zero-errors export gate blocks on them) AND are re-checked in
// the export route itself, so a broken bundle can't be produced even by calling
// the API directly.

// Every Step in the proxy, tagged with where it lives, so a reference check can
// name the exact flow a bad step is in. Order matters for a future dataflow
// analysis pass, so this walks in Apigee's real execution order.
export function* iterateSteps(proxy) {
  const pe = proxy.proxyEndpointName || 'default';
  const peFile = `apiproxy/proxies/${pe}.xml`;
  const emit = (steps, where, file) => (steps || []).map((s, i) => ({ step: s, where, file, index: i }));

  // A flow toggled off (Flow.enabled === false) doesn't exist in the exported
  // bundle at all (see buildFlowsBlock), so it's skipped here too — a Step
  // inside it can't be a real dangling reference, and a policy referenced
  // only from a disabled flow is correctly treated as unreferenced.
  const activeFlows = (proxy.flows || []).filter((f) => f.enabled !== false);

  yield* emit(proxy.preFlow?.request, 'ProxyEndpoint PreFlow Request', peFile);
  for (const f of activeFlows) yield* emit(f.request, `Flow "${f.name}" Request`, peFile);
  yield* emit(proxy.postFlow?.request, 'ProxyEndpoint PostFlow Request', peFile);
  for (const t of proxy.targets || []) {
    const tf = `apiproxy/targets/${t.name}.xml`;
    const activeTargetFlows = (t.flows || []).filter((f) => f.enabled !== false);
    yield* emit(t.preFlow?.request, `Target "${t.name}" PreFlow Request`, tf);
    for (const f of activeTargetFlows) yield* emit(f.request, `Target "${t.name}" Flow "${f.name}" Request`, tf);
    yield* emit(t.postFlow?.request, `Target "${t.name}" PostFlow Request`, tf);
    yield* emit(t.postFlow?.response, `Target "${t.name}" PostFlow Response`, tf);
    for (const f of activeTargetFlows) yield* emit(f.response, `Target "${t.name}" Flow "${f.name}" Response`, tf);
    yield* emit(t.preFlow?.response, `Target "${t.name}" PreFlow Response`, tf);
    // Conditional rules first, then the default — Apigee's own evaluation
    // order, and the order buildFaultRulesBlock writes them in.
    for (const r of t.faultRules?.rules || []) {
      yield* emit(r.steps, `Target "${t.name}" FaultRule "${r.name}"`, tf);
    }
    yield* emit(t.faultRules?.steps, `Target "${t.name}" DefaultFaultRule`, tf);
    yield* emit(t.eventFlow?.response, `Target "${t.name}" EventFlow Response`, tf);
  }
  for (const f of activeFlows) yield* emit(f.response, `Flow "${f.name}" Response`, peFile);
  yield* emit(proxy.postFlow?.response, 'ProxyEndpoint PostFlow Response', peFile);
  yield* emit(proxy.preFlow?.response, 'ProxyEndpoint PreFlow Response', peFile);
  yield* emit(proxy.postClientFlow?.response, 'PostClientFlow Response', peFile);
  for (const r of proxy.faultRules?.rules || []) {
    yield* emit(r.steps, `ProxyEndpoint FaultRule "${r.name}"`, peFile);
  }
  yield* emit(proxy.faultRules?.steps, 'ProxyEndpoint DefaultFaultRule', peFile);
}

// Shared by both the proxy and shared-flow bundle paths: which Steps name a
// policy that doesn't exist (dangling — a real deploy failure), and which
// policies aren't named by any Step at all (orphaned — legal, but nearly
// always a leftover from a rename or deletion gone half-done).
function checkPolicyReferences(entries, policyNames) {
  const dangling = [];
  const referenced = new Set();
  for (const { step, where, file } of entries) {
    referenced.add(step.policyName);
    if (!policyNames.has(step.policyName)) dangling.push({ file, where, policyName: step.policyName });
  }
  return { dangling, referenced };
}

// Apigee restricts API proxy names to these characters.
const PROXY_NAME_RE = /^[A-Za-z0-9_-]+$/;

// Placeholder tokens left in a policy template. Deliberately narrow: SHOUTY_SNAKE
// inside braces. Real Apigee flow variables are lowercase and dotted
// (`request.verb`, `organization.name`) and message templates are function calls
// (`{jsonPath(...)}`), so neither is matched. At runtime an unresolved
// `{PROJECT_ID}` collapses to an empty string, silently producing a URL like
// `https://-aiplatform.googleapis.com/v1/projects//locations/...`.
const PLACEHOLDER_RE = /\{([A-Z][A-Z0-9_]{2,})\}/g;

function isEffectivelyEmptyUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return true;
  // The generator falls back to a bare "https://" when no URL is set; a scheme
  // with no host is the same thing.
  return /^[a-z][a-z0-9+.-]*:\/\/$/i.test(trimmed);
}

function renderVarValue(varValue) {
  if (!varValue || !varValue.value) return '';
  return varValue.mode === 'variable' ? `{${varValue.value}}` : varValue.value;
}

/**
 * Returns a list of blocking problems, each shaped like a lint message so it can
 * be merged straight into a LintResult:
 *   { filePath, ruleId, message, severity: 'error', line: null, column: null }
 */
export function collectDeployBlockers(proxy, { knownSharedFlows = null } = {}) {
  const problems = [];
  const root = 'apiproxy';
  const peName = proxy.proxyEndpointName || 'default';
  const add = (filePath, ruleId, message, severity = 'error') =>
    problems.push({ filePath, ruleId, message, severity, line: null, column: null });

  // --- Identity -------------------------------------------------------------
  if (!PROXY_NAME_RE.test(String(proxy.name || ''))) {
    add(
      `${root}/${proxy.name}.xml`,
      'DEPLOY001',
      `Proxy name "${proxy.name}" is not valid for Apigee — only letters, numbers, underscores and hyphens are allowed. Rename it on the Overview tab before exporting.`
    );
  }

  // --- Base path ------------------------------------------------------------
  // <BasePath> is required, and an empty one makes the proxy answer at the
  // environment root (or fail validation outright) rather than at a path.
  const basePath = String(proxy.basePath || '').trim();
  if (!basePath) {
    add(
      `${root}/proxies/${peName}.xml`,
      'DEPLOY002',
      'Base path is empty. Set one on the Overview tab (e.g. "/my-api") — an empty <BasePath> will not route as you expect.'
    );
  } else if (!basePath.startsWith('/')) {
    add(
      `${root}/proxies/${peName}.xml`,
      'DEPLOY002',
      `Base path "${basePath}" must start with "/".`
    );
  } else if (basePath.startsWith('/*')) {
    // Documented as unsupported: a wildcard may not be the first segment.
    add(
      `${root}/proxies/${peName}.xml`,
      'DEPLOY002',
      `Base path "${basePath}" starts with a wildcard, which Apigee does not support as the first segment.`
    );
  }

  // --- Route rules ----------------------------------------------------------
  for (const rr of proxy.routeRules || []) {
    const mode = rr.mode || 'target';
    if (mode === 'target' && !String(rr.targetName || '').trim()) {
      add(
        `${root}/proxies/${peName}.xml`,
        'DEPLOY003',
        `Route rule "${rr.name}" routes to a Target Endpoint but none is selected.`
      );
    }
    if (mode === 'url' && isEffectivelyEmptyUrl(rr.url)) {
      add(
        `${root}/proxies/${peName}.xml`,
        'DEPLOY003',
        `Route rule "${rr.name}" routes to a URL but the URL is empty.`
      );
    }
  }

  // --- Targets --------------------------------------------------------------
  for (const target of proxy.targets || []) {
    const file = `${root}/targets/${target.name}.xml`;
    if (target.mode === 'targetServer') {
      if (!target.targetServers?.length) {
        add(
          file,
          'DEPLOY004',
          `Target "${target.name}" is set to load-balance across Target Servers but none are listed. The bundle would ship a placeholder <Server name="target-server-name"/>, which does not exist in your environment.`
        );
      }
    } else if (isEffectivelyEmptyUrl(renderVarValue(target.url))) {
      add(
        file,
        'DEPLOY004',
        `Target "${target.name}" has no backend URL. The bundle would ship <URL>https://</URL>, which deploys but fails on every request.`
      );
    }
    if (target.path?.value && target.path.mode === 'literal' && !String(target.path.value).startsWith('/')) {
      add(file, 'DEPLOY004', `Target "${target.name}" has a Path ("${target.path.value}") that does not start with "/".`);
    }
  }

  // --- Policy placeholders --------------------------------------------------
  problems.push(...collectPolicyPlaceholders(proxy.policies, `${root}/policies`));

  // --- Step -> policy references ---------------------------------------------
  // The most common real-world break: deleting a policy in the UI doesn't
  // necessarily purge every Step that referenced it, and apigeelint's own
  // check for this isn't reliable across every flow position.
  const policyNames = new Set((proxy.policies || []).map((p) => p.name));
  const { dangling, referenced } = checkPolicyReferences(iterateSteps(proxy), policyNames);
  for (const { file, where, policyName } of dangling) {
    add(
      file,
      'DEPLOY006',
      `${where} has a Step referencing policy "${policyName}", which does not exist in this proxy. Apigee rejects the bundle at deploy time.`
    );
  }
  for (const policy of proxy.policies || []) {
    if (referenced.has(policy.name)) continue;
    add(
      `${root}/policies/${policy.name}.xml`,
      'DEPLOY007',
      `Policy "${policy.name}" isn't referenced by any Step. It deploys fine but never runs — usually a leftover from a rename or deletion.`,
      'warning'
    );
  }

  // --- FlowCallout -> shared flow references ---------------------------------
  // knownSharedFlows is only passed by the proxy bundle/lint/export routes,
  // which have access to the locally saved shared flow list; skip entirely
  // when it isn't provided rather than treating "unknown" as "missing" — the
  // shared flow may already exist in the org without existing in Studio.
  if (knownSharedFlows) {
    const knownNames = new Set(knownSharedFlows);
    for (const policy of proxy.policies || []) {
      const m = String(policy.xml || '').match(/<SharedFlowBundle>([^<]*)<\/SharedFlowBundle>/);
      if (!m) continue;
      const sharedFlowName = m[1].trim();
      if (sharedFlowName && !knownNames.has(sharedFlowName)) {
        add(
          `${root}/policies/${policy.name}.xml`,
          'DEPLOY008',
          `Policy "${policy.name}" calls shared flow "${sharedFlowName}", which isn't one of your saved shared flows. If it already exists in your Apigee org this is fine — otherwise it must be deployed there before this proxy.`,
          'warning'
        );
      }
    }
  }

  // --- Resource references ----------------------------------------------------
  // A missing resource is a hard deploy failure (or a runtime throw for a
  // Javascript IncludeURL), so this is an error, not a warning.
  const knownResourcePaths = new Set((proxy.resources || []).map((r) => r.path));
  for (const policy of proxy.policies || []) {
    for (const refPath of extractResourcePaths(policy.xml)) {
      if (refPath.includes('{')) continue; // resolved at runtime — can't check statically
      if (!knownResourcePaths.has(refPath)) {
        add(
          `${root}/policies/${policy.name}.xml`,
          'DEPLOY009',
          `Policy "${policy.name}" references resource "${refPath}", which isn't in this bundle. Add it on the Resources tab (or as this policy's own resource file) before exporting.`
        );
      }
    }
  }

  return problems;
}

/**
 * Unreplaced {SHOUTY_SNAKE} tokens in policy XML. Shared with the shared-flow
 * bundle, which has policies but none of the proxy-level structure above.
 */
export function collectPolicyPlaceholders(policies, policiesDir) {
  const problems = [];
  for (const policy of policies || []) {
    const found = [...new Set([...String(policy.xml || '').matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
    if (!found.length) continue;
    problems.push({
      filePath: `${policiesDir}/${policy.name}.xml`,
      ruleId: 'DEPLOY005',
      message: `Policy "${policy.name}" still contains template placeholders: ${found
        .map((f) => `{${f}}`)
        .join(', ')}. Apigee resolves unknown {…} references to an empty string, so these must be replaced with real values before this will work.`,
      severity: 'error',
      line: null,
      column: null,
    });
  }
  return problems;
}

export function collectSharedFlowDeployBlockers(sharedFlow, { knownSharedFlows = null } = {}) {
  const problems = [];
  const add = (filePath, ruleId, message, severity = 'error') =>
    problems.push({ filePath, ruleId, message, severity, line: null, column: null });

  if (!PROXY_NAME_RE.test(String(sharedFlow.name || ''))) {
    add(
      `sharedflowbundle/${sharedFlow.name}.xml`,
      'DEPLOY001',
      `Shared flow name "${sharedFlow.name}" is not valid for Apigee — only letters, numbers, underscores and hyphens are allowed.`
    );
  }
  problems.push(...collectPolicyPlaceholders(sharedFlow.policies, 'sharedflowbundle/policies'));

  // --- Step -> policy references (same rules as the proxy path, over a flat
  // step list — a Shared Flow has no Request/Response split or conditional
  // flows of its own) ----------------------------------------------------------
  const flowFile = 'sharedflowbundle/sharedflows/default.xml';
  const policyNames = new Set((sharedFlow.policies || []).map((p) => p.name));
  const entries = (sharedFlow.steps || []).map((step) => ({ step, where: 'SharedFlow', file: flowFile }));
  const { dangling, referenced } = checkPolicyReferences(entries, policyNames);
  for (const { file, policyName } of dangling) {
    add(
      file,
      'DEPLOY006',
      `This shared flow has a Step referencing policy "${policyName}", which does not exist in it. Apigee rejects the bundle at deploy time.`
    );
  }
  for (const policy of sharedFlow.policies || []) {
    if (referenced.has(policy.name)) continue;
    add(
      `sharedflowbundle/policies/${policy.name}.xml`,
      'DEPLOY007',
      `Policy "${policy.name}" isn't referenced by any Step. It deploys fine but never runs — usually a leftover from a rename or deletion.`,
      'warning'
    );
  }

  // --- Nested FlowCallout -> shared flow references ---------------------------
  if (knownSharedFlows) {
    const knownNames = new Set(knownSharedFlows);
    for (const policy of sharedFlow.policies || []) {
      const m = String(policy.xml || '').match(/<SharedFlowBundle>([^<]*)<\/SharedFlowBundle>/);
      if (!m) continue;
      const nested = m[1].trim();
      if (nested && !knownNames.has(nested)) {
        add(
          `sharedflowbundle/policies/${policy.name}.xml`,
          'DEPLOY008',
          `Policy "${policy.name}" calls shared flow "${nested}", which isn't one of your saved shared flows. If it already exists in your Apigee org this is fine — otherwise it must be deployed there before this one.`,
          'warning'
        );
      }
    }
  }

  // --- Resource references ----------------------------------------------------
  const knownResourcePaths = new Set((sharedFlow.resources || []).map((r) => r.path));
  for (const policy of sharedFlow.policies || []) {
    for (const refPath of extractResourcePaths(policy.xml)) {
      if (refPath.includes('{')) continue;
      if (!knownResourcePaths.has(refPath)) {
        add(
          `sharedflowbundle/policies/${policy.name}.xml`,
          'DEPLOY009',
          `Policy "${policy.name}" references resource "${refPath}", which isn't in this bundle.`
        );
      }
    }
  }

  return problems;
}
