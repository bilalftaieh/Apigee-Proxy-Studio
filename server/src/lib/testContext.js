// Shared execution state for a single test run: the flow-variable namespace,
// the request/response "message" objects, and the {var} templating helper
// used by AssignMessage/RaiseFault/AssignVariable. Used by both testRunner.js
// (which drives the pipeline) and policyExecutors.js (which mutates this
// state on behalf of individual policies).

// Thrown by a policy executor to short-circuit the pipeline into fault
// handling — mirrors Apigee's RaiseFault/VerifyAPIKey-failure/etc. behavior.
export class FaultError extends Error {
  constructor(fault) {
    super(fault?.message || 'Policy raised a fault');
    this.fault = fault;
  }
}

function headerKey(name) {
  return String(name || '').toLowerCase();
}

export function getHeader(msg, name) {
  return msg.headers[headerKey(name)]?.value;
}

export function setHeader(msg, name, value) {
  msg.headers[headerKey(name)] = { name, value: String(value ?? '') };
}

export function removeHeader(msg, name) {
  delete msg.headers[headerKey(name)];
}

export function listHeaders(msg) {
  return Object.values(msg.headers);
}

// A "message" is a request or response in flight — deliberately plain data
// (no methods) so it can be spread straight into a trace entry or API
// response without leaking internals.
export function createMessage({ verb, pathSuffix, headers = {}, queryParams = {}, content = '', status, reasonPhrase } = {}) {
  const msg = { verb, pathSuffix, queryParams: { ...queryParams }, content, status, reasonPhrase, headers: {} };
  for (const [name, value] of Object.entries(headers)) setHeader(msg, name, value);
  return msg;
}

// Seeds the in-memory stateful-policy stores from a test case's optional
// `initialState` — without this, a KVM Get or a Quota check has nothing to
// read on the very first (and only) request a test sends, since these Maps
// are otherwise created empty per run and never persist between runs.
//   initialState.kvm.<mapIdentifier>.<compositeKey> = value
//   initialState.cache.<cacheResource>.<compositeKey> = value
//   initialState.quota.<policyName::identifier> = count
//   initialState.spikeArrest.<policyName::identifier> = count
function seedStores(stores, initialState) {
  if (!initialState) return;
  for (const [mapId, entries] of Object.entries(initialState.kvm || {})) {
    for (const [key, value] of Object.entries(entries)) stores.kvm.set(`${mapId}::${key}`, value);
  }
  for (const [cacheResource, entries] of Object.entries(initialState.cache || {})) {
    for (const [key, value] of Object.entries(entries)) stores.cache.set(`${cacheResource}::${key}`, value);
  }
  for (const [key, count] of Object.entries(initialState.quota || {})) stores.quota.set(key, Number(count) || 0);
  for (const [key, count] of Object.entries(initialState.spikeArrest || {})) stores.spikeArrest.set(key, Number(count) || 0);
}

export function createContext({ proxy, request, initialState }) {
  const stores = { kvm: new Map(), cache: new Map(), quota: new Map(), spikeArrest: new Map() };
  seedStores(stores, initialState);
  return {
    proxyBasePath: proxy.basePath,
    // Resource files a policy may need at run time — a Javascript policy's
    // script and any <IncludeURL> library it pulls in.
    resources: proxy.resources || [],
    variables: {},
    request,
    response: undefined,
    phase: 'request', // 'request' | 'response' — which message context.*/AssignMessage defaults to
    scope: 'proxy', // 'proxy' | 'target' — which FaultRules block catches a fault raised right now
    stores, // in-memory mocks for KVM/Cache/Quota/SpikeArrest — scoped to this run only, never persisted
  };
}

// Resolves a variable name against built-in Apigee variables first, then the
// flat custom-variable namespace. Deliberately covers the built-ins the
// condition builder and these policy executors actually touch, not the full
// Apigee variable reference.
export function getVariable(ctx, name) {
  switch (name) {
    case 'request.verb':
      return ctx.request.verb;
    case 'request.content':
      return ctx.request.content;
    case 'proxy.pathsuffix':
      return ctx.request.pathSuffix;
    case 'proxy.basepath':
      return ctx.proxyBasePath;
    case 'response.content':
      return ctx.response?.content;
    case 'response.status.code':
      return ctx.response?.status;
    case 'response.reason.phrase':
      return ctx.response?.reasonPhrase;
    default:
      break;
  }
  if (name.startsWith('request.header.')) return getHeader(ctx.request, name.slice('request.header.'.length));
  if (name.startsWith('request.queryparam.')) return ctx.request.queryParams[name.slice('request.queryparam.'.length)];
  if (name.startsWith('response.header.')) return ctx.response ? getHeader(ctx.response, name.slice('response.header.'.length)) : undefined;
  return ctx.variables[name];
}

export function setVariable(ctx, name, value) {
  if (name === 'request.content') {
    ctx.request.content = String(value ?? '');
    return;
  }
  if (name === 'response.content' && ctx.response) {
    ctx.response.content = String(value ?? '');
    return;
  }
  if (name === 'response.status.code' && ctx.response) {
    ctx.response.status = Number(value);
    return;
  }
  if (name === 'response.reason.phrase' && ctx.response) {
    ctx.response.reasonPhrase = String(value ?? '');
    return;
  }
  if (name.startsWith('request.header.')) {
    setHeader(ctx.request, name.slice('request.header.'.length), value);
    return;
  }
  if (name.startsWith('response.header.') && ctx.response) {
    setHeader(ctx.response, name.slice('response.header.'.length), value);
    return;
  }
  ctx.variables[name] = value;
}

// Renders `{var.name}` placeholders the way Apigee does. When a referenced
// variable can't be resolved: IgnoreUnresolvedVariables=true (the default in
// every template in this project) renders it as an empty string; false
// raises a fault, matching real Apigee behavior.
// A real Apigee variable name is letters/digits/dot/underscore/hyphen,
// starting with a letter or underscore. Restricting the placeholder match to
// that shape (rather than "anything between braces") is what keeps a literal
// JSON payload like `{"error": "Bad Request"}` — this project's own default
// RaiseFault template — from being mistaken for a variable reference.
const VARIABLE_PLACEHOLDER = /\{([a-zA-Z_][\w.-]*)\}/g;

export function renderTemplate(str, ctx, { ignoreUnresolved = true, policyName } = {}) {
  if (str == null) return '';
  let unresolvedName = null;
  const result = String(str).replace(VARIABLE_PLACEHOLDER, (match, varName) => {
    const name = varName.trim();
    const val = getVariable(ctx, name);
    if (val === undefined || val === null) {
      unresolvedName = name;
      return '';
    }
    return String(val);
  });
  if (unresolvedName && !ignoreUnresolved) {
    throw new FaultError({ message: `Unresolved variable "${unresolvedName}" in policy "${policyName}"`, status: 500 });
  }
  return result;
}
