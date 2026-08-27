import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function attr(node, name) {
  return node?.[`@_${name}`];
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// "$.customer.email" -> ['customer', 'email']. Array indices/wildcards
// ("$.items[0].sku") are stripped rather than modeled — good enough to place
// the field at a sane spot in the example body without pretending to know
// how many array entries a tester should send.
function jsonPathToFieldPath(jsonPath, fallbackName) {
  const cleaned = String(jsonPath || '')
    .replace(/^\$\.?/, '')
    .replace(/\[[^\]]*\]/g, '');
  const path = cleaned.split('.').map((s) => s.trim()).filter(Boolean);
  return path.length ? path : [fallbackName];
}

function sampleValueFor(type) {
  switch (String(type || '').toLowerCase()) {
    case 'boolean':
      return true;
    case 'integer':
    case 'long':
      return 0;
    case 'float':
    case 'double':
      return 0;
    default:
      return '';
  }
}

// Reduces an ExtractVariables policy — the Apigee-native way of declaring
// "this flow reads these fields off the request" — down to the query/form/
// JSON-body fields both exporters need to pre-fill an example request.
function describePolicy(policy) {
  if (policy.type !== 'ExtractVariables') return null;
  let parsed;
  try {
    parsed = xmlParser.parse(policy.xml);
  } catch {
    return null;
  }
  const root = parsed.ExtractVariables;
  if (!root) return null;

  const queryParams = asArray(root.QueryParam)
    .map((qp) => attr(qp, 'name'))
    .filter(Boolean);

  const formParams = asArray(root.FormParam)
    .map((fp) => attr(fp, 'name'))
    .filter(Boolean);

  const jsonFields = [];
  if (root.JSONPayload) {
    for (const v of asArray(root.JSONPayload.Variable)) {
      const name = attr(v, 'name');
      if (!name) continue;
      const jsonPath = v.JSONPath !== undefined ? String(v.JSONPath) : null;
      jsonFields.push({ path: jsonPathToFieldPath(jsonPath, name), value: sampleValueFor(attr(v, 'type')) });
    }
  }

  return { queryParams, formParams, jsonFields };
}

function emptyFields() {
  return { queryParams: [], formParams: [], jsonFields: [] };
}

function schemesFromSteps(steps, policiesByName) {
  const acc = emptyFields();
  for (const step of steps || []) {
    const policy = policiesByName.get(step.policyName);
    if (!policy) continue;
    const described = describePolicy(policy);
    if (!described) continue;
    acc.queryParams.push(...described.queryParams);
    acc.formParams.push(...described.formParams);
    acc.jsonFields.push(...described.jsonFields);
  }
  return acc;
}

function hasAnyField(fields) {
  return fields.queryParams.length > 0 || fields.formParams.length > 0 || fields.jsonFields.length > 0;
}

// Mirrors detectSecuritySchemes: fields read in ProxyEndpoint PreFlow apply
// to every request, fields read by a specific conditional flow only apply there.
export function detectRequestFields(proxy) {
  const policiesByName = new Map((proxy.policies || []).map((p) => [p.name, p]));

  const global = schemesFromSteps(proxy.preFlow?.request, policiesByName);

  const perFlow = new Map();
  for (const flow of proxy.flows || []) {
    const fields = schemesFromSteps(flow.request, policiesByName);
    if (hasAnyField(fields)) perFlow.set(flow.id, fields);
  }

  return { global, perFlow };
}
