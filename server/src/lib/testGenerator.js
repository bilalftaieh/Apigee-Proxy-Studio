import { nanoid } from 'nanoid';
import { getPolicyType } from './policyTemplates.js';
import { routeOfFlow } from './model.js';
import { paramExampleText, exampleFromSchema } from './flowContract.js';

// `TestCase` and the simulator already exist and work — every test is
// hand-written, though, so in practice the happy path gets written and the
// failure modes that actually break in production (missing key, malformed
// payload, quota exceeded, backend 500, wrong verb) never do. This derives
// those from what's already in the model: FlowContract (params/body) and
// which policies actually guard a flow's request path.

function tagOf(policy) {
  return getPolicyType(policy.type)?.xmlTag || policy.type;
}

// Policies that actually run before a flow's request reaches the target:
// the ProxyEndpoint's own PreFlow (unconditional, guards every flow) plus
// this flow's own conditional Steps.
function requestGuardPolicies(proxy, flow) {
  const stepNames = new Set([...(proxy.preFlow?.request || []), ...(flow ? flow.request || [] : [])].map((s) => s.policyName));
  return (proxy.policies || []).filter((p) => stepNames.has(p.name));
}

function newAssertion(type, expected, name) {
  return { id: nanoid(8), type, expected, ...(name ? { name } : {}) };
}

function baseCase(name, verb, pathSuffix) {
  return {
    id: nanoid(10),
    name: `neg: ${name}`,
    generated: true,
    request: { verb, pathSuffix: pathSuffix || '/', headers: {}, queryParams: {}, body: '' },
    mockTargetResponse: { status: 200, headers: {}, body: '{}' },
    assertions: [],
  };
}

// <APIKey ref="request.queryparam.apikey"/> or "...header.x-api-key" — falls
// back to the app's own default template's location when unset/unrecognized.
function apiKeyLocation(policy) {
  const m = String(policy.xml || '').match(/<APIKey\s+ref="([^"]+)"/);
  const ref = m ? m[1] : 'request.queryparam.apikey';
  const parts = ref.split('.');
  const inHeader = parts[1] === 'header';
  const paramName = parts.slice(2).join('.') || 'apikey';
  return { inHeader, paramName };
}

function quotaAllow(policy) {
  const m = String(policy.xml || '').match(/<Allow[^>]*count="(\d+)"/) || String(policy.xml || '').match(/<Allow[^>]*>(\d+)<\/Allow>/);
  return m ? Number(m[1]) : 0;
}

function spikeArrestLimit(policy) {
  const m = String(policy.xml || '').match(/<Rate>([^<]+)<\/Rate>/);
  const rate = m ? /^(\d+)\s*p[sm]$/i.exec(m[1].trim()) : null;
  return rate ? Number(rate[1]) : 0;
}

function authTestsFor(guards, label, verb, pathSuffix) {
  const tests = [];
  for (const policy of guards) {
    const tag = tagOf(policy);
    if (tag === 'VerifyAPIKey') {
      const { inHeader, paramName } = apiKeyLocation(policy);
      const missing = baseCase(`missing api key — ${label}`, verb, pathSuffix);
      missing.assertions = [newAssertion('status', '401')];
      tests.push(missing);

      const malformed = baseCase(`malformed api key — ${label}`, verb, pathSuffix);
      if (inHeader) malformed.request.headers[paramName] = 'not-a-real-key';
      else malformed.request.queryParams[paramName] = 'not-a-real-key';
      malformed.assertions = [newAssertion('status', '401')];
      tests.push(malformed);
    } else if (tag === 'OAuthV2' && /<Operation>\s*VerifyAccessToken\s*<\/Operation>/.test(policy.xml || '')) {
      const missing = baseCase(`missing bearer token — ${label}`, verb, pathSuffix);
      missing.assertions = [newAssertion('status', '401')];
      tests.push(missing);

      const malformed = baseCase(`malformed bearer token — ${label}`, verb, pathSuffix);
      malformed.request.headers.Authorization = 'Bearer not-a-real-token';
      malformed.assertions = [newAssertion('status', '401')];
      tests.push(malformed);
    } else if (tag === 'BasicAuthentication') {
      const missing = baseCase(`missing basic auth — ${label}`, verb, pathSuffix);
      missing.assertions = [newAssertion('status', '401')];
      tests.push(missing);
    }
  }
  return tests;
}

function trafficTestsFor(guards, label, verb, pathSuffix) {
  const tests = [];
  for (const policy of guards) {
    const tag = tagOf(policy);
    if (tag === 'Quota') {
      const t = baseCase(`quota exceeded — ${label}`, verb, pathSuffix);
      t.initialState = { quota: { [`${policy.name}::`]: quotaAllow(policy) } };
      t.assertions = [newAssertion('status', '429')];
      tests.push(t);
    } else if (tag === 'SpikeArrest') {
      const t = baseCase(`rate exceeded — ${label}`, verb, pathSuffix);
      t.initialState = { spikeArrest: { [`${policy.name}::`]: spikeArrestLimit(policy) } };
      t.assertions = [newAssertion('status', '429')];
      tests.push(t);
    }
  }
  return tests;
}

// One test per required FlowParam, omitted in turn from an otherwise-filled
// request built from the contract's own example values.
function requiredParamTestsFor(contract, label, verb, pathSuffix) {
  const required = (contract.params || []).filter((p) => p.required);
  if (!required.length) return [];

  const happyQuery = {};
  const happyHeaders = {};
  for (const p of required) {
    const value = paramExampleText(p);
    if (p.in === 'header') happyHeaders[p.name] = value;
    else happyQuery[p.name] = value; // path params have nowhere else to go in a flat query/header test request
  }

  return required.map((p) => {
    const t = baseCase(`missing required param "${p.name}" — ${label}`, verb, pathSuffix);
    t.request.queryParams = { ...happyQuery };
    t.request.headers = { ...happyHeaders };
    if (p.in === 'header') delete t.request.headers[p.name];
    else delete t.request.queryParams[p.name];
    t.assertions = [newAssertion('fault', 'true')];
    return t;
  });
}

function bodyTestsFor(contract, label, verb, pathSuffix) {
  const tests = [];
  const body = contract.body;
  if (!body || !/json/i.test(body.contentType || '')) return tests;

  const invalidJson = baseCase(`invalid JSON body — ${label}`, verb, pathSuffix);
  invalidJson.request.body = '{ this is not valid json';
  invalidJson.assertions = [newAssertion('fault', 'true')];
  tests.push(invalidJson);

  if (body.schema) {
    const example = exampleFromSchema(body.schema);
    if (example && typeof example === 'object' && !Array.isArray(example)) {
      const keys = Object.keys(example);
      if (keys.length) {
        const missingField = { ...example };
        delete missingField[keys[0]];
        const t = baseCase(`body missing "${keys[0]}" — ${label}`, verb, pathSuffix);
        t.request.body = JSON.stringify(missingField);
        t.assertions = [newAssertion('fault', 'true')];
        tests.push(t);
      }
    }
  }
  return tests;
}

export function generateNegativeTests(proxy) {
  const tests = [];
  // `null` stands for "no conditional flow matched" — the ProxyEndpoint's own
  // PreFlow-guarded base case, worth its own auth/backend-failure coverage
  // even on a proxy with zero conditional flows. Disabled flows are skipped —
  // they aren't in the exported bundle, so there's nothing to test.
  const activeFlows = (proxy.flows || []).filter((f) => f.enabled !== false);
  const flows = activeFlows.length ? activeFlows : [null];

  for (const flow of flows) {
    const route = flow ? routeOfFlow(flow) : { verb: 'GET', pathSuffix: '', matchesAnyVerb: true };
    const verb = route.matchesAnyVerb ? 'GET' : route.verb;
    const pathSuffix = route.pathSuffix || '/';
    const label = flow ? `${verb} ${pathSuffix}` : `${verb} ${pathSuffix} (base)`;
    const guards = requestGuardPolicies(proxy, flow);

    tests.push(...authTestsFor(guards, label, verb, pathSuffix));
    tests.push(...trafficTestsFor(guards, label, verb, pathSuffix));

    if (flow?.contract) {
      tests.push(...requiredParamTestsFor(flow.contract, label, verb, pathSuffix));
      tests.push(...bodyTestsFor(flow.contract, label, verb, pathSuffix));
    }

    // A verb this flow's own condition rejects — no assertion is generated:
    // whether it should 404, fall through to a catch-all flow, or something
    // else entirely depends on flows this generator has no way to rank, so
    // this is left as a scaffold to inspect the trace on, not a pass/fail check.
    if (flow && !route.matchesAnyVerb) {
      const otherVerb = route.verb === 'GET' ? 'POST' : 'GET';
      tests.push(baseCase(`unhandled verb ${otherVerb} — ${pathSuffix}`, otherVerb, pathSuffix));
    }

    const backend500 = baseCase(`backend 500 — ${label}`, verb, pathSuffix);
    backend500.mockTargetResponse = { status: 500, headers: {}, body: '{"error":"backend exploded"}' };
    backend500.assertions = [newAssertion('fault', 'true')];
    tests.push(backend500);
  }

  return tests;
}
