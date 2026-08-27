import { iterateSteps } from './deployChecks.js';
import { applyEnvironmentOverrides } from './model.js';
import { GOVERNANCE_RULES } from '../seed/governanceRules.js';

/**
 * Cross-proxy analysis — the questions the Apigee console structurally cannot
 * answer, because it shows you one proxy at a time and this tool has all of
 * them on disk at once:
 *
 *   base paths     Which proxies would collide, or quietly shadow each other,
 *                  when deployed to the same environment.
 *   backends       Reverse index host -> proxies. "I'm changing payments-svc,
 *                  what breaks?" is otherwise a proxy-by-proxy manual search.
 *   shared flows   Who calls what, what nothing calls, what is called but
 *                  doesn't exist, and whether the call graph has a cycle.
 *   governance     Your own house rules (see seed/governanceRules.js) run
 *                  across every proxy in one pass.
 *
 * Everything here is read-only and derived. Nothing writes back to a proxy.
 */

// ------------------------------------------------------------------ helpers

/** Bare identity for a proxy, so findings can link back without shipping the whole thing. */
function ref(proxy) {
  return { id: proxy.id, name: proxy.name };
}

/**
 * Apigee stores a base path without a trailing slash, but a proxy imported
 * from a hand-written bundle can carry one. Comparing the raw strings would
 * then miss a real collision between "/v1/orders" and "/v1/orders/".
 */
function normalizeBasePath(raw) {
  const s = String(raw || '').trim();
  if (!s) return '/';
  const rooted = s.startsWith('/') ? s : `/${s}`;
  return rooted.length > 1 ? rooted.replace(/\/+$/, '') : '/';
}

// ------------------------------------------------------------- 1. base paths

/**
 * Base paths must be unique per environment: deploying a second proxy on a
 * base path another proxy already holds fails outright. Nesting is a separate,
 * legal case — Apigee routes on the longest match — so it's reported as
 * information rather than a problem, because for a path-per-service layout it
 * is the intended design and warning about it every time would be noise.
 */
function analyzeBasePaths(proxies) {
  const byPath = new Map();
  const map = [];

  for (const proxy of proxies) {
    const basePath = normalizeBasePath(proxy.basePath);
    map.push({ ...ref(proxy), basePath, raw: proxy.basePath, wildcard: basePath.includes('*') });
    if (!byPath.has(basePath)) byPath.set(basePath, []);
    byPath.get(basePath).push(ref(proxy));
  }

  const conflicts = [...byPath.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([basePath, group]) => ({ basePath, proxies: group }));

  // Nested: "/v1" holds a prefix of "/v1/orders". A request to /v1/orders/9
  // goes to the more specific proxy, so any flow in the shorter one that
  // expects to serve that path never fires.
  const nested = [];
  const distinct = [...byPath.keys()].filter((p) => !p.includes('*'));
  for (const prefix of distinct) {
    const under = distinct.filter((p) => p !== prefix && p.startsWith(prefix === '/' ? '/' : `${prefix}/`));
    if (!under.length) continue;
    nested.push({
      basePath: prefix,
      proxies: byPath.get(prefix),
      shadowed: under.map((p) => ({ basePath: p, proxies: byPath.get(p) })),
    });
  }

  // A `*` in a base path is legal and matches at runtime, which means two
  // wildcard paths can overlap in ways no string comparison can settle. Say so
  // rather than reporting a clean bill of health we can't actually give.
  const wildcards = map.filter((m) => m.wildcard);

  map.sort((a, b) => a.basePath.localeCompare(b.basePath));
  return { map, conflicts, nested, wildcards };
}

// --------------------------------------------------------------- 2. backends

const AUTHORITY_RE = /^([a-zA-Z][a-zA-Z0-9+.\-]*):\/\/([^/?#]*)/;

/**
 * Splits an endpoint into the part that identifies a backend (scheme + host)
 * and everything else. Returns null for an empty value, and a `dynamic` result
 * whenever the authority itself is templated — "https://{host}/v1" names no
 * single backend, and pretending otherwise would put a bogus row in the index.
 * A variable *after* the authority ("https://api.example.com/{version}") still
 * resolves to a real host, so that case indexes normally.
 */
function parseEndpoint(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = AUTHORITY_RE.exec(s);
  if (!m) return { kind: 'dynamic', display: s };
  const [, scheme, authority] = m;
  if (!authority || /[{}]/.test(authority)) return { kind: 'dynamic', display: s };
  const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return { kind: 'host', scheme: scheme.toLowerCase(), host: hostPort.toLowerCase(), display: s };
}

function endpointOf(varValue) {
  if (!varValue) return null;
  if (varValue.mode === 'variable') {
    const name = String(varValue.value || '').trim();
    return name ? { kind: 'dynamic', display: `{${name}}` } : null;
  }
  return parseEndpoint(varValue.value);
}

/**
 * Every distinct target configuration this proxy can deploy with — the base
 * one, plus one per environment whose override actually changes something.
 * Environments that resolve identically are collapsed, so a workspace with
 * dev/uat/prod overrides doesn't triple every row in the index for the targets
 * that are the same everywhere.
 */
function* targetResolutions(proxy) {
  const base = proxy.targets || [];
  const seen = new Map();
  for (const t of base) seen.set(t.id, new Set());

  for (const t of base) {
    seen.get(t.id).add(JSON.stringify([t.mode, t.url, t.targetServers]));
    yield { target: t, environment: null };
  }

  for (const env of proxy.environments || []) {
    const overridden = applyEnvironmentOverrides(proxy, env.id);
    for (const t of overridden.targets || []) {
      const key = JSON.stringify([t.mode, t.url, t.targetServers]);
      const bucket = seen.get(t.id);
      if (!bucket || bucket.has(key)) continue;
      bucket.add(key);
      yield { target: t, environment: env.name };
    }
  }
}

function analyzeBackends(proxies) {
  const hosts = new Map();
  const targetServers = new Map();
  const dynamic = [];

  const push = (map, key, seed, usage) => {
    if (!map.has(key)) map.set(key, { ...seed, usages: [] });
    map.get(key).usages.push(usage);
  };

  for (const proxy of proxies) {
    for (const { target, environment } of targetResolutions(proxy)) {
      const where = `Target "${target.name}"`;
      if (target.mode === 'targetServer') {
        const servers = (target.targetServers || []).filter(Boolean);
        for (const name of servers) {
          // The row already sits under a heading naming this server, so the
          // detail is only worth spending when there's something else to say:
          // which *other* servers this target load-balances across.
          const siblings = servers.filter((s) => s !== name);
          const detail = siblings.length ? `load balanced with ${siblings.join(', ')}` : '';
          push(targetServers, name, { name }, { ...ref(proxy), where, environment, detail });
        }
        continue;
      }
      const ep = endpointOf(target.url);
      if (!ep) continue;
      if (ep.kind === 'dynamic') {
        dynamic.push({ ...ref(proxy), where, environment, detail: ep.display });
      } else {
        push(hosts, `${ep.scheme}://${ep.host}`, { scheme: ep.scheme, host: ep.host }, { ...ref(proxy), where, environment, detail: ep.display });
      }
    }

    // RouteRules in 'url' mode bypass /targets entirely and call a backend
    // directly, so they belong in this index too or the answer to "who calls
    // this host" is quietly incomplete.
    for (const rule of proxy.routeRules || []) {
      if (rule.mode !== 'url') continue;
      const ep = parseEndpoint(rule.url);
      if (!ep) continue;
      const where = `RouteRule "${rule.name}"`;
      if (ep.kind === 'dynamic') {
        dynamic.push({ ...ref(proxy), where, environment: null, detail: ep.display });
      } else {
        push(hosts, `${ep.scheme}://${ep.host}`, { scheme: ep.scheme, host: ep.host }, { ...ref(proxy), where, environment: null, detail: ep.display });
      }
    }
  }

  const byUsageThenName = (a, b) => b.usages.length - a.usages.length || a.host?.localeCompare(b.host) || a.name?.localeCompare(b.name) || 0;
  return {
    hosts: [...hosts.entries()].map(([key, v]) => ({ key, ...v })).sort(byUsageThenName),
    targetServers: [...targetServers.values()].sort(byUsageThenName),
    dynamic,
  };
}

// ---------------------------------------------------------- 3. shared flows

const SHARED_FLOW_BUNDLE_RE = /<SharedFlowBundle>([^<]*)<\/SharedFlowBundle>/;

/** Which policy names are actually wired into a Step, for a proxy or a shared flow. */
function attachedPolicyNames(entity, isSharedFlow) {
  if (isSharedFlow) return new Set((entity.steps || []).map((s) => s.policyName));
  const names = new Set();
  for (const { step } of iterateSteps(entity)) names.add(step.policyName);
  return names;
}

function flowCalloutRefs(entity, isSharedFlow) {
  const attached = attachedPolicyNames(entity, isSharedFlow);
  const out = [];
  for (const policy of entity.policies || []) {
    if (policy.type !== 'FlowCallout') continue;
    const name = SHARED_FLOW_BUNDLE_RE.exec(policy.xml || '')?.[1]?.trim();
    if (!name) continue;
    out.push({ sharedFlowName: name, policyName: policy.name, attached: attached.has(policy.name) });
  }
  return out;
}

/**
 * A shared flow calling a shared flow that (transitively) calls it back
 * deploys fine and then recurses at runtime. Nothing in Apigee warns about it,
 * and it is invisible in a per-bundle view by construction.
 */
function findCycles(edges) {
  const cycles = [];
  const state = new Map(); // name -> 'visiting' | 'done'
  const stack = [];

  const walk = (name) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      cycles.push([...stack.slice(stack.indexOf(name)), name]);
      return;
    }
    state.set(name, 'visiting');
    stack.push(name);
    for (const next of edges.get(name) || []) walk(next);
    stack.pop();
    state.set(name, 'done');
  };

  for (const name of edges.keys()) walk(name);
  return cycles;
}

function analyzeSharedFlows(proxies, sharedFlows) {
  const byName = new Map();
  const localByName = new Map(sharedFlows.map((sf) => [sf.name, sf]));
  const edges = new Map(sharedFlows.map((sf) => [sf.name, []]));

  const record = (name, caller) => {
    if (!byName.has(name)) byName.set(name, { name, definedLocally: localByName.has(name), localId: localByName.get(name)?.id ?? null, callers: [] });
    byName.get(name).callers.push(caller);
  };

  for (const proxy of proxies) {
    for (const r of flowCalloutRefs(proxy, false)) {
      record(r.sharedFlowName, { kind: 'proxy', ...ref(proxy), policyName: r.policyName, attached: r.attached });
    }
  }
  for (const sf of sharedFlows) {
    for (const r of flowCalloutRefs(sf, true)) {
      record(r.sharedFlowName, { kind: 'sharedFlow', id: sf.id, name: sf.name, policyName: r.policyName, attached: r.attached });
      if (edges.has(sf.name)) edges.get(sf.name).push(r.sharedFlowName);
    }
  }

  // Every locally-defined shared flow appears in the list even with no
  // callers — "nothing calls this" is the finding, so it can't be a row that
  // only exists once something references it.
  for (const sf of sharedFlows) {
    if (!byName.has(sf.name)) byName.set(sf.name, { name: sf.name, definedLocally: true, localId: sf.id, callers: [] });
  }

  const flows = [...byName.values()].sort((a, b) => b.callers.length - a.callers.length || a.name.localeCompare(b.name));

  return {
    flows,
    // An empty shared flow that four proxies call is a live production
    // no-op, so it's called out separately from "unused".
    empty: sharedFlows
      .filter((sf) => !(sf.steps || []).length)
      .map((sf) => ({ id: sf.id, name: sf.name, callerCount: byName.get(sf.name)?.callers.length ?? 0 })),
    unused: flows.filter((f) => f.definedLocally && f.callers.length === 0).map((f) => ({ id: f.localId, name: f.name })),
    missing: flows.filter((f) => !f.definedLocally),
    cycles: findCycles(edges),
  };
}

// ----------------------------------------------------------- 4. governance

function governanceContext(proxy) {
  const policyByName = new Map((proxy.policies || []).map((p) => [p.name, p]));
  const attachedNames = new Set();
  const attachedTypes = new Set();
  const proxyRequestTypes = new Set();

  for (const { step, where } of iterateSteps(proxy)) {
    attachedNames.add(step.policyName);
    const type = policyByName.get(step.policyName)?.type;
    if (!type) continue;
    attachedTypes.add(type);
    // The ProxyEndpoint request path — where a gate has to sit to gate
    // anything. A policy on the response, or on a TargetEndpoint, has already
    // let the request through.
    if (!where.startsWith('Target ') && where.endsWith('Request')) proxyRequestTypes.add(type);
  }

  return { policyByName, attachedNames, attachedTypes, proxyRequestTypes };
}

function runGovernance(proxies) {
  const findings = [];
  const waived = [];

  for (const proxy of proxies) {
    const ctx = governanceContext(proxy);
    for (const rule of GOVERNANCE_RULES) {
      if ((proxy.lintExcludes || []).includes(rule.id)) {
        waived.push({ ruleId: rule.id, ...ref(proxy) });
        continue;
      }
      let messages;
      try {
        messages = rule.check(proxy, ctx) || [];
      } catch (err) {
        // A rule that throws is a bug in governanceRules.js, not a finding
        // about the proxy — report it as itself rather than letting one bad
        // rule take down the whole audit.
        messages = [`Rule threw while checking this proxy: ${err.message}`];
      }
      for (const message of messages) {
        findings.push({ ruleId: rule.id, severity: rule.severity, ...ref(proxy), message });
      }
    }
  }

  return {
    rules: GOVERNANCE_RULES.map(({ id, label, severity, rationale }) => ({ id, label, severity, rationale })),
    findings,
    waived,
  };
}

// ------------------------------------------------------------------- public

export function auditWorkspace({ proxies = [], sharedFlows = [] } = {}) {
  const basePaths = analyzeBasePaths(proxies);
  const backends = analyzeBackends(proxies);
  const sharedFlowUsage = analyzeSharedFlows(proxies, sharedFlows);
  const governance = runGovernance(proxies);

  return {
    generatedAt: Date.now(),
    stats: {
      proxyCount: proxies.length,
      sharedFlowCount: sharedFlows.length,
      hostCount: backends.hosts.length,
      targetServerCount: backends.targetServers.length,
      basePathConflicts: basePaths.conflicts.length,
      governanceErrors: governance.findings.filter((f) => f.severity === 'error').length,
      governanceWarnings: governance.findings.filter((f) => f.severity === 'warning').length,
    },
    basePaths,
    backends,
    sharedFlowUsage,
    governance,
  };
}
