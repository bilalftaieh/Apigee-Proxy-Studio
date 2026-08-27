// Shared helpers for Flow.contract — the request/response shape captured at
// import time so the Postman/OpenAPI exporters can rebuild a runnable artifact
// instead of emitting an empty `{}` body and no parameters.
//
// Both importers write this; both exporters read it. Keeping the shape in one
// place is what stops the two exporters drifting apart the way they did over
// custom-mode flow conditions.

const MAX_EXAMPLE_DEPTH = 6;

export function emptyContract() {
  return { params: [], responses: [] };
}

export function isEmptyContract(contract) {
  if (!contract) return true;
  return !contract.params?.length && !contract.body && !contract.responses?.length && !contract.operationId;
}

/**
 * Resolves internal $refs so a stored schema is self-contained — the source
 * document isn't around at export time. Cyclic refs unwind to a bare
 * `{ type: 'object' }` rather than recursing forever.
 */
export function resolveSchemaRefs(schema, doc, seen = new Set(), depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > MAX_EXAMPLE_DEPTH) return schema;

  if (typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return { type: 'object' };
    const path = schema.$ref.replace(/^#\//, '').split('/');
    let node = doc;
    for (const part of path) {
      node = node?.[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
      if (node == null) return { type: 'object' };
    }
    return resolveSchemaRefs(node, doc, new Set([...seen, schema.$ref]), depth + 1);
  }

  if (Array.isArray(schema)) return schema.map((s) => resolveSchemaRefs(s, doc, seen, depth + 1));

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key] = value && typeof value === 'object' ? resolveSchemaRefs(value, doc, seen, depth + 1) : value;
  }
  return out;
}

function sampleScalar(schema) {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  switch (schema.type) {
    case 'integer':
      return 0;
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return '1970-01-01T00:00:00Z';
      if (schema.format === 'date') return '1970-01-01';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      return '';
    default:
      return '';
  }
}

/**
 * Builds a concrete example value from a JSON Schema. Only `required`
 * properties are populated by default: a request body that sends every optional
 * field is usually *less* likely to succeed against a strict backend than the
 * minimal one, and it's easier to add a field in Postman than to work out which
 * of twenty to delete. Objects with no `required` list fall back to all
 * properties, since something is better than `{}`.
 */
export function exampleFromSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > MAX_EXAMPLE_DEPTH) return null;
  if (schema.example !== undefined) return schema.example;

  // Composition keywords: the first branch is a reasonable representative.
  const branch = schema.allOf || schema.oneOf || schema.anyOf;
  if (Array.isArray(branch) && branch.length) {
    if (schema.allOf) {
      const merged = {};
      for (const part of schema.allOf) {
        const sub = exampleFromSchema(part, depth + 1);
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) Object.assign(merged, sub);
      }
      return Object.keys(merged).length ? merged : null;
    }
    return exampleFromSchema(branch[0], depth + 1);
  }

  const type = schema.type || (schema.properties ? 'object' : schema.items ? 'array' : undefined);

  if (type === 'object') {
    const properties = schema.properties || {};
    const names = Object.keys(properties);
    if (!names.length) return {};
    const required = Array.isArray(schema.required) && schema.required.length ? schema.required : names;
    const out = {};
    for (const name of names) {
      if (!required.includes(name)) continue;
      const sub = exampleFromSchema(properties[name], depth + 1);
      out[name] = sub === null ? '' : sub;
    }
    return out;
  }

  if (type === 'array') {
    const item = exampleFromSchema(schema.items, depth + 1);
    return item === null ? [] : [item];
  }

  return sampleScalar(schema);
}

/** Best available concrete body text for this contract, or null. */
export function bodyExampleText(body) {
  if (!body) return null;
  if (body.example) return body.example;
  if (!body.schema) return null;
  const example = exampleFromSchema(body.schema);
  if (example === null || example === undefined) return null;
  if (typeof example === 'string') return example;
  return JSON.stringify(example, null, 2);
}

/** Best available concrete value for a single parameter, as a string. */
export function paramExampleText(param) {
  if (param.example != null && param.example !== '') return String(param.example);
  if (param.enumValues?.length) return String(param.enumValues[0]);
  switch (param.type) {
    case 'integer':
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    default:
      return '';
  }
}

export function paramsIn(contract, location) {
  return (contract?.params || []).filter((p) => p.in === location);
}

/**
 * Normalizes an on-disk contract, dropping anything malformed. Returns
 * undefined when there's nothing worth keeping so old proxies stay byte-identical.
 */
export function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const locations = new Set(['query', 'header', 'path']);
  const param = (p) => ({
    name: String(p.name),
    in: locations.has(p.in) ? p.in : 'query',
    ...(p.required ? { required: true } : {}),
    ...(p.description ? { description: String(p.description) } : {}),
    ...(p.type ? { type: String(p.type) } : {}),
    ...(Array.isArray(p.enumValues) && p.enumValues.length ? { enumValues: p.enumValues.map(String) } : {}),
    ...(p.example != null && p.example !== '' ? { example: String(p.example) } : {}),
  });

  const params = Array.isArray(raw.params) ? raw.params.filter((p) => p && p.name).map(param) : [];
  const responses = Array.isArray(raw.responses)
    ? raw.responses
        .filter((r) => r && r.status)
        .map((r) => ({
          status: String(r.status),
          ...(r.description ? { description: String(r.description) } : {}),
          ...(r.contentType ? { contentType: String(r.contentType) } : {}),
          ...(r.example ? { example: String(r.example) } : {}),
        }))
    : [];

  let body;
  if (raw.body && typeof raw.body === 'object' && (raw.body.schema || raw.body.example || raw.body.formParams?.length)) {
    body = {
      contentType: String(raw.body.contentType || 'application/json'),
      ...(raw.body.required ? { required: true } : {}),
      ...(raw.body.schema ? { schema: raw.body.schema } : {}),
      ...(raw.body.example ? { example: String(raw.body.example) } : {}),
      ...(Array.isArray(raw.body.formParams) && raw.body.formParams.length
        ? { formParams: raw.body.formParams.filter((p) => p && p.name).map(param) }
        : {}),
    };
  }

  const contract = {
    ...(raw.operationId ? { operationId: String(raw.operationId) } : {}),
    params,
    ...(body ? { body } : {}),
    responses,
  };
  return isEmptyContract(contract) ? undefined : contract;
}
