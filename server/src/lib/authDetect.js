import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function attr(node, name) {
  return node?.[`@_${name}`];
}

// Reduces a VerifyAPIKey/OAuthV2/VerifyJWT policy down to the shape both
// exporters need: where the credential travels and what to call it. Returns
// null for policy types that aren't an inbound auth check (e.g. GenerateJWT).
function describePolicy(policy) {
  let parsed;
  try {
    parsed = xmlParser.parse(policy.xml);
  } catch {
    return null;
  }

  if (policy.type === 'VerifyAPIKey') {
    const node = parsed.VerifyAPIKey;
    const ref = attr(node?.APIKey, 'ref') || 'request.queryparam.apikey';
    const inHeader = /header\./i.test(ref);
    const paramName = ref.split('.').pop() || 'apikey';
    return { policyName: policy.name, kind: 'apiKey', in: inHeader ? 'header' : 'query', paramName };
  }

  if (policy.type === 'OAuthV2') {
    const operation = String(parsed.OAuthV2?.Operation ?? '').trim();
    if (operation && operation !== 'VerifyAccessToken') return null;
    return { policyName: policy.name, kind: 'oauth2', headerName: 'Authorization' };
  }

  if (policy.type === 'VerifyJWT') {
    const source = String(parsed.VerifyJWT?.Source ?? 'request.header.Authorization').trim();
    const headerMatch = source.match(/^request\.header\.(.+)$/i);
    return { policyName: policy.name, kind: 'jwt', headerName: headerMatch ? headerMatch[1] : 'Authorization' };
  }

  return null;
}

// Walks the step names referenced by a request phase and resolves each one
// against the proxy's policy list, keeping only recognized inbound-auth types.
function schemesFromSteps(steps, policiesByName) {
  const out = [];
  for (const step of steps || []) {
    const policy = policiesByName.get(step.policyName);
    if (!policy) continue;
    const described = describePolicy(policy);
    if (described) out.push(described);
  }
  return out;
}

// Detects inbound security schemes actually wired into the proxy, split into
// ones enforced on every request (ProxyEndpoint PreFlow) vs. ones only
// enforced on specific conditional flows. Both exporters (Postman, OpenAPI)
// use this so their notion of "this endpoint needs an API key" always agrees.
export function detectSecuritySchemes(proxy) {
  const policiesByName = new Map((proxy.policies || []).map((p) => [p.name, p]));

  const global = schemesFromSteps(proxy.preFlow?.request, policiesByName);

  const perFlow = new Map();
  for (const flow of proxy.flows || []) {
    const schemes = schemesFromSteps(flow.request, policiesByName);
    if (schemes.length) perFlow.set(flow.id, schemes);
  }

  return { global, perFlow };
}
