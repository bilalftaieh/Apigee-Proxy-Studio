import { nanoid } from 'nanoid';
import { normalizeContract } from './flowContract.js';

// Flows saved before Flow.contract existed simply have none — normalizeContract
// returns undefined for anything absent or malformed, so those keep serializing
// exactly as before. Flows saved before the enabled/disabled toggle existed
// have no `enabled` field at all, which must mean "on" (true) — the same
// bundle they always generated.
function normalizeFlow(f) {
  if (!f || typeof f !== 'object') return f;
  const contract = normalizeContract(f.contract);
  const { contract: _drop, ...rest } = f;
  return { ...(contract ? { ...rest, contract } : rest), enabled: f.enabled !== false };
}

function normalizeFlows(flows) {
  return Array.isArray(flows) ? flows.map(normalizeFlow) : [];
}

// Coerces legacy on-disk shapes (url as a plain string, path as a plain string)
// into the current { mode, value } VarValue shape, so proxies saved before
// the Target Server / hardcode-vs-variable feature keep working.
function normalizeVarValue(v) {
  if (v == null) return { mode: 'literal', value: '' };
  if (typeof v === 'string') return { mode: 'literal', value: v };
  return { mode: v.mode === 'variable' ? 'variable' : 'literal', value: v.value ?? '' };
}

// Proxies saved before TLS/Google-auth/EventFlow support have none of these
// fields; every one is optional and normalizes to "not configured" so an old
// on-disk proxy keeps generating byte-identical XML.
function normalizeSslInfo(s) {
  if (!s || typeof s !== 'object') return undefined;
  return {
    enabled: s.enabled !== false,
    clientAuthEnabled: !!s.clientAuthEnabled,
    keyStore: s.keyStore || '',
    keyAlias: s.keyAlias || '',
    trustStore: s.trustStore || '',
    ignoreValidationErrors: !!s.ignoreValidationErrors,
  };
}

function normalizeAuthentication(a) {
  if (!a || typeof a !== 'object') return undefined;
  const mode = ['googleIdToken', 'googleAccessToken'].includes(a.mode) ? a.mode : 'none';
  if (mode === 'none') return undefined;
  return {
    mode,
    audience: a.audience ? normalizeVarValue(a.audience) : { mode: 'literal', value: '' },
    useTargetUrl: !!a.useTargetUrl,
    scopes: Array.isArray(a.scopes) ? a.scopes.filter(Boolean) : [],
    headerName: a.headerName || '',
  };
}

// EventFlow and PostClientFlow are both response-only in Apigee's schema; any
// stray `request` array from an older save is dropped rather than emitted.
function normalizeEventFlow(e) {
  if (!e || typeof e !== 'object') return undefined;
  const response = Array.isArray(e.response) ? e.response : [];
  if (!response.length) return undefined;
  return { contentType: e.contentType || 'text/event-stream', response };
}

// `rules` (the conditional <FaultRule> list) postdates `steps` (the single
// <DefaultFaultRule>), so anything saved before it exists has no field at all.
// Filling it with [] here means every consumer can read `.rules` without a
// guard, and a proxy that has none still generates byte-identical XML.
//
// Rule ids are Studio-only — the bundle has nowhere to put them — so one is
// minted for any rule arriving without one, which is every rule coming off an
// imported bundle.
function normalizeFaultRules(fr) {
  const steps = Array.isArray(fr?.steps) ? fr.steps : [];
  const rules = Array.isArray(fr?.rules)
    ? fr.rules
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({
          id: r.id || nanoid(8),
          name: r.name || 'FaultRule',
          condition: r.condition || '',
          steps: Array.isArray(r.steps) ? r.steps : [],
        }))
    : [];
  return { rules, steps };
}

export function normalizeTarget(t) {
  if (!t) return t;
  return {
    ...t,
    mode: t.mode === 'targetServer' ? 'targetServer' : 'url',
    url: normalizeVarValue(t.url),
    targetServers: Array.isArray(t.targetServers) ? t.targetServers : [],
    path: t.path ? normalizeVarValue(t.path) : undefined,
    preFlow: t.preFlow || { request: [], response: [] },
    postFlow: t.postFlow || { request: [], response: [] },
    flows: normalizeFlows(t.flows),
    faultRules: normalizeFaultRules(t.faultRules),
    eventFlow: normalizeEventFlow(t.eventFlow),
    sslInfo: normalizeSslInfo(t.sslInfo),
    authentication: normalizeAuthentication(t.authentication),
  };
}

// A rule stored without `mode` predates URL/null routing and is a plain
// TargetEndpoint route.
function normalizeRouteRule(rr) {
  if (!rr) return rr;
  const mode = ['url', 'null'].includes(rr.mode) ? rr.mode : 'target';
  return { ...rr, mode, url: rr.url || '' };
}

// Proxies saved before shared resources existed have none — absent -> [], so
// every proxy on disk keeps generating byte-identical XML until a resource is
// actually added. Anything missing a resources/-prefixed path is dropped
// rather than kept malformed.
export function normalizeResources(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r.path === 'string' && r.path.startsWith('resources/'))
    .map((r) => ({ id: r.id || nanoid(), path: r.path, content: String(r.content ?? '') }));
}

/**
 * Folds any legacy per-policy `resource` into the proxy-level `resources`
 * collection and drops the field.
 *
 * An Apigee bundle has no notion of a file *belonging* to a policy — there is
 * only `resources/` and the XML references pointing into it. Ownership was a
 * Studio invention, and it cost two editing surfaces, two code paths in the
 * generator and importer, and a rename rule ("a policy's file follows its
 * name") that is plain wrong for a file several policies share.
 *
 * Every creation path — the policy gallery, policy chains, built-in templates,
 * and the OpenAPI/WSDL importers — sets `policy.resource`, and all of them run
 * through here, so this one fold migrates the lot without touching any of them.
 * First writer wins on a path collision, which keeps a hand-edited file from
 * being replaced by a type default.
 */
export function foldPolicyResources(policies, resources) {
  const folded = [...resources];
  const byPath = new Set(folded.map((r) => r.path));
  const cleanedPolicies = (policies || []).map((policy) => {
    if (!policy?.resource?.path) return policy;
    const { resource, ...rest } = policy;
    if (!byPath.has(resource.path)) {
      byPath.add(resource.path);
      folded.push({ id: nanoid(), path: resource.path, content: String(resource.content ?? '') });
    }
    return rest;
  });
  return { policies: cleanedPolicies, resources: folded };
}

export function normalizeProxy(proxy) {
  if (!proxy) return proxy;
  const { policies, resources } = foldPolicyResources(proxy.policies, normalizeResources(proxy.resources));
  return {
    ...proxy,
    policies,
    targets: (proxy.targets || []).map(normalizeTarget),
    flows: normalizeFlows(proxy.flows),
    routeRules: (proxy.routeRules || []).map(normalizeRouteRule),
    faultRules: normalizeFaultRules(proxy.faultRules),
    postClientFlow: { response: Array.isArray(proxy.postClientFlow?.response) ? proxy.postClientFlow.response : [] },
    resources,
    lintExcludes: Array.isArray(proxy.lintExcludes) ? proxy.lintExcludes : [],
    environments: Array.isArray(proxy.environments) ? proxy.environments : [],
    tests: Array.isArray(proxy.tests) ? proxy.tests : [],
  };
}

// Merges a named environment's per-target overrides onto the proxy — used
// right before generating/linting/exporting a bundle for a specific
// environment. Returns `proxy` unchanged when no environmentId is given or
// it doesn't match any defined environment.
export function applyEnvironmentOverrides(proxy, environmentId) {
  if (!environmentId) return proxy;
  const env = (proxy.environments || []).find((e) => e.id === environmentId);
  if (!env) return proxy;
  return {
    ...proxy,
    targets: proxy.targets.map((t) => {
      const override = env.targetOverrides?.[t.id];
      if (!override) return t;
      return {
        ...t,
        mode: override.mode ?? t.mode,
        url: override.url ?? t.url,
        targetServers: override.targetServers ?? t.targetServers,
        path: override.path !== undefined ? override.path : t.path,
      };
    }),
  };
}

// A path template segment (`{petId}`) is this app's own internal notation for
// "one variable segment" — it's what the exporters read to rebuild an OpenAPI
// path template (openApiExporter's pathParams) or a Postman `:petId` variable,
// so it's kept verbatim in flow.pathValue. Apigee's condition grammar has no
// such syntax: MatchesPath only understands `*` (one segment) and `**` (many),
// and a literal "/pets/{petId}" pattern matches nothing at all. So the
// translation happens here, at the point the condition string is built, rather
// than in the importers — that way all three importers (OpenAPI, Postman,
// curl) and the UI's Path/Verb builder get it right from one place, and a
// later UI edit can't regenerate the broken form.
//
// A literal `"` is dropped rather than escaped: the pattern is interpolated
// into a double-quoted condition string, and Apigee's grammar offers no
// backslash escape and no alternate quote character, so there is no spelling of
// it that survives. Emitting it raw produced `MatchesPath "/a"b"` — a condition
// Apigee rejects at deploy time. Callers that can surface a warning should
// compare their input against the result (see the importers).
//
// Mirrors the client's toApigeePathPattern (client/src/lib/condition.ts).
export function toApigeePathPattern(pathValue) {
  return (pathValue || '').trim().replace(/\{[^/{}]*\}/g, '*').replace(/"/g, '');
}

// Mirrors the client's computeFlowCondition (client/src/lib/condition.ts) —
// shared by every importer that scaffolds simple-mode conditional flows
// (curl, OpenAPI, Postman) so the generated condition string always matches
// what the Path/Verb builder itself would produce for the same inputs.
export function buildFlowCondition(pathOperator, pathValue, verb) {
  const path = toApigeePathPattern(pathValue);
  const pathPart = path ? `proxy.pathsuffix ${pathOperator} "${path}"` : '';
  const verbPart = verb && verb !== 'ANY' ? `request.verb = "${verb}"` : '';
  if (pathPart && verbPart) return `(${pathPart}) and (${verbPart})`;
  return pathPart || verbPart || '';
}

// A flow built with the Path/Verb builder keeps pathValue/verb in sync with
// `condition` automatically (see buildFlowCondition above). A flow switched to
// 'custom' mode is hand-edited free text, so pathValue/verb can be stale or
// absent — the condition string is the only thing Apigee actually evaluates, so
// custom flows are read back out of it.
//
// Shared by every exporter, so the Postman collection, the OpenAPI spec and the
// flow diagram all agree on what a given flow's route is.
function extractVerbFromCondition(condition = '') {
  const m = condition.match(/request\.verb\s*=\s*"(\w+)"/i);
  return m ? m[1].toUpperCase() : null;
}

function extractPathSuffixFromCondition(condition = '') {
  const m = condition.match(/pathsuffix\s+(?:MatchesPath|Equals|=)\s*"([^"]*)"/i);
  return m ? m[1] : null;
}

export function routeOfFlow(flow) {
  if (flow.conditionMode === 'custom') {
    const verb = extractVerbFromCondition(flow.condition);
    return {
      verb: verb || 'GET',
      pathSuffix: extractPathSuffixFromCondition(flow.condition) || '',
      // No `request.verb =` in the condition means it really does match any
      // method, as opposed to us having failed to read a specific one.
      matchesAnyVerb: !verb,
    };
  }
  return {
    verb: flow.verb && flow.verb !== 'ANY' ? flow.verb : 'GET',
    pathSuffix: flow.pathValue || '',
    matchesAnyVerb: !flow.verb || flow.verb === 'ANY',
  };
}

export function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'proxy';
}

export function createBlankProxy({ name, basePath, description } = {}) {
  const id = nanoid(10);
  const safeName = name || 'new-proxy';
  return {
    id,
    name: safeName,
    basePath: basePath || `/${slugify(safeName)}`,
    description: description || '',
    proxyEndpointName: 'default',
    policies: [],
    resources: [],
    targets: [
      {
        id: nanoid(8),
        name: 'default',
        mode: 'url',
        url: { mode: 'literal', value: 'https://mocktarget.apigee.net' },
        targetServers: [],
        description: 'Default Target Endpoint',
        preFlow: { request: [], response: [] },
        postFlow: { request: [], response: [] },
        flows: [],
        faultRules: { steps: [] },
        // The default target is https, and apigeelint's TD012 wants exactly one
        // <SSLInfo> on an https target — so a fresh proxy starts lint-clean
        // instead of shipping a warning nobody could previously fix.
        sslInfo: { enabled: true },
      },
    ],
    preFlow: { request: [], response: [] },
    postFlow: { request: [], response: [] },
    postClientFlow: { response: [] },
    flows: [],
    routeRules: [{ id: nanoid(8), name: 'default', targetName: 'default', condition: '', mode: 'target' }],
    faultRules: { steps: [] },
    lintExcludes: [],
    environments: [],
    tests: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function cloneProxyFromTemplate(template, { name, basePath } = {}) {
  const cloned = JSON.parse(JSON.stringify(template.proxy));
  const id = nanoid(10);
  const safeName = name || `${template.proxy.name}-copy`;
  return normalizeProxy({
    ...cloned,
    id,
    name: safeName,
    basePath: basePath || `/${slugify(safeName)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function uniqueCopyName(baseName, takenNames) {
  let name = `${baseName}-copy`;
  let suffix = 2;
  while (takenNames.includes(name)) {
    name = `${baseName}-copy-${suffix++}`;
  }
  return name;
}

export function duplicateProxy(existing, existingNames = []) {
  const cloned = JSON.parse(JSON.stringify(existing));
  const name = uniqueCopyName(existing.name, existingNames);
  return normalizeProxy({
    ...cloned,
    id: nanoid(10),
    name,
    basePath: `/${slugify(name)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
