import { detectSecuritySchemes } from './authDetect.js';
import { routeOfFlow } from './model.js';

function normalizePath(pathValue) {
  const trimmed = String(pathValue || '').trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

// Every `{name}` in the path must be declared as a required path parameter, or
// the document is invalid. Contract data (description, example, type) is layered
// on top where the import captured it; the path template is the source of truth
// for *which* params exist.
function pathParams(pathValue, contract) {
  const names = [...String(pathValue || '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const declared = new Map((contract?.params || []).filter((p) => p.in === 'path').map((p) => [p.name, p]));
  return names.map((name) => {
    const known = declared.get(name);
    return {
      name,
      in: 'path',
      required: true,
      ...(known?.description ? { description: known.description } : {}),
      schema: {
        type: known?.type || 'string',
        ...(known?.enumValues?.length ? { enum: known.enumValues } : {}),
      },
      ...(known?.example ? { example: known.example } : {}),
    };
  });
}

// Query and header parameters as captured at import. Path params are handled by
// pathParams() from the path template, so they're excluded here to avoid
// emitting a duplicate (which is also a spec violation).
function contractParams(contract) {
  return (contract?.params || [])
    .filter((p) => p.in === 'query' || p.in === 'header')
    .map((p) => ({
      name: p.name,
      in: p.in,
      ...(p.required ? { required: true } : {}),
      ...(p.description ? { description: p.description } : {}),
      schema: {
        type: p.type || 'string',
        ...(p.enumValues?.length ? { enum: p.enumValues } : {}),
      },
      ...(p.example ? { example: p.example } : {}),
    }));
}

function requestBodyFor(contract, verb, bodyVerbs) {
  const body = contract?.body;
  if (!body) {
    // No captured contract: an untyped object is the honest placeholder for a
    // verb that carries a body, and nothing at all for one that doesn't.
    return bodyVerbs.has(verb)
      ? { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } } }
      : {};
  }
  // A form body has no JSON Schema of its own, but OAS models urlencoded and
  // multipart bodies as an object schema — so the field names survive instead of
  // collapsing to a bare `{ type: 'object' }`.
  const schema =
    body.schema ||
    (body.formParams?.length
      ? {
          type: 'object',
          ...(body.formParams.some((p) => p.required)
            ? { required: body.formParams.filter((p) => p.required).map((p) => p.name) }
            : {}),
          properties: Object.fromEntries(
            body.formParams.map((p) => [
              p.name,
              {
                type: p.type || 'string',
                ...(p.enumValues?.length ? { enum: p.enumValues } : {}),
                ...(p.description ? { description: p.description } : {}),
                ...(p.example ? { example: p.example } : {}),
              },
            ])
          ),
        }
      : { type: 'object' });

  const media = {
    schema,
    ...(body.example ? { example: tryParseJson(body.example, body.contentType) } : {}),
  };
  return { requestBody: { ...(body.required ? { required: true } : { required: false }), content: { [body.contentType]: media } } };
}

// An OAS `example` is a value, not a string — a JSON body captured as text
// should be re-emitted as the object it represents so tooling can render it.
function tryParseJson(text, contentType) {
  if (!/json/i.test(contentType || '')) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responsesFor(contract) {
  const captured = contract?.responses || [];
  if (!captured.length) {
    return { 200: { description: 'Successful response' }, default: { description: 'Unexpected error' } };
  }
  const out = {};
  for (const r of captured) {
    out[r.status] = {
      description: r.description || (r.status === 'default' ? 'Unexpected error' : 'Response'),
      ...(r.contentType && r.example
        ? { content: { [r.contentType]: { example: tryParseJson(r.example, r.contentType) } } }
        : {}),
    };
  }
  return out;
}

// Groups operations by their first path segment, which is how nearly every
// published spec organizes itself and what drives the sidebar in Swagger UI,
// Redoc and Postman's spec import.
function tagFor(pathKey) {
  const first = String(pathKey || '').split('/').filter(Boolean)[0];
  if (!first || first.startsWith('{')) return null;
  return first;
}

function dedupeSchemes(schemes) {
  const seen = new Set();
  const out = [];
  for (const s of schemes) {
    const key = s.kind === 'apiKey' ? `apiKey:${s.in}:${s.paramName}` : `${s.kind}:${s.headerName || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Names every distinct scheme once (so an API key checked by two
// differently-named policies still only produces one `ApiKeyAuth` component)
// and returns the OpenAPI `security` requirement array for a given scheme set.
function securityRequirement(schemes, schemeNames) {
  return schemes.map((s) => {
    const key = s.kind === 'apiKey' ? `apiKey:${s.in}:${s.paramName}` : `${s.kind}:${s.headerName || ''}`;
    return { [schemeNames.get(key)]: [] };
  });
}

function registerSchemes(schemes, schemeNames, securitySchemes) {
  for (const s of schemes) {
    const key = s.kind === 'apiKey' ? `apiKey:${s.in}:${s.paramName}` : `${s.kind}:${s.headerName || ''}`;
    if (schemeNames.has(key)) continue;
    if (s.kind === 'apiKey') {
      const name = schemeNames.size === 0 || ![...schemeNames.values()].includes('ApiKeyAuth') ? 'ApiKeyAuth' : `ApiKeyAuth${schemeNames.size}`;
      schemeNames.set(key, name);
      securitySchemes[name] = { type: 'apiKey', in: s.in, name: s.paramName };
    } else {
      const name = ![...schemeNames.values()].includes('BearerAuth') ? 'BearerAuth' : `BearerAuth${schemeNames.size}`;
      schemeNames.set(key, name);
      securitySchemes[name] = { type: 'http', scheme: 'bearer', ...(s.kind === 'jwt' ? { bearerFormat: 'JWT' } : {}) };
    }
  }
}

// OpenAPI requires operationId to be unique across the whole document, and
// sanitising ("Get User" and "Get-User" both collapse to "Get_User") makes
// collisions easy. Codegen tools either refuse the spec or silently generate one
// method for two operations, so collisions get a numeric suffix.
function uniqueOperationId(flowName, fallback, taken) {
  const base = String(flowName || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}_${n++}`;
  taken.add(candidate);
  return candidate;
}

// Order-independent comparison of two scheme sets. The previous
// JSON.stringify(a) !== JSON.stringify(b) check also reported "differs" when the
// same schemes merely arrived in a different order, which put a redundant
// per-operation `security` block on operations that actually just inherit the
// document default.
function sameSchemeSet(a, b) {
  const key = (s) => (s.kind === 'apiKey' ? `apiKey:${s.in}:${s.paramName}` : `${s.kind}:${s.headerName || ''}`);
  if (a.length !== b.length) return false;
  const setB = new Set(b.map(key));
  return a.every((s) => setB.has(key(s)));
}

export function generateOpenApiSpec(proxy) {
  const { global, perFlow } = detectSecuritySchemes(proxy);
  const globalDeduped = dedupeSchemes(global);

  const schemeNames = new Map();
  const securitySchemes = {};
  registerSchemes(globalDeduped, schemeNames, securitySchemes);
  for (const schemes of perFlow.values()) registerSchemes(dedupeSchemes(schemes), schemeNames, securitySchemes);

  const bodyVerbs = new Set(['POST', 'PUT', 'PATCH']);
  const paths = {};
  const operationIds = new Set();
  const collisions = [];
  const tags = new Set();

  for (const flow of proxy.flows || []) {
    // routeOfFlow, not flow.pathValue/flow.verb directly: a flow in 'custom'
    // condition mode carries stale or empty builder fields, and reading them
    // turned `DELETE /users/{id}` into `GET /`. Shared with the Postman
    // exporter so both describe the same endpoint.
    const { verb, pathSuffix, matchesAnyVerb } = routeOfFlow(flow);
    const pathKey = normalizePath(pathSuffix);
    const method = verb.toLowerCase();

    if (!paths[pathKey]) paths[pathKey] = {};
    if (paths[pathKey][method]) {
      // Don't drop it silently — two flows on one path+verb is a real
      // modelling problem the author should know about.
      collisions.push(`${verb} ${pathKey} (flow "${flow.name}")`);
      continue;
    }

    const schemes = dedupeSchemes([...global, ...(perFlow.get(flow.id) || [])]);
    const differsFromGlobal = !sameSchemeSet(schemes, globalDeduped);
    const contract = flow.contract;
    const tag = tagFor(pathKey);
    if (tag) tags.add(tag);

    // `summary` is the short label and `description` the prose — the reverse of
    // what this used to do. Renderers show summary in the operation list and
    // description in the expanded body, so putting prose in summary made the
    // sidebar unreadable.
    const description = [flow.description, matchesAnyVerb ? `This Apigee flow matches any HTTP method; documented here as ${verb}.` : null]
      .filter(Boolean)
      .join('\n\n');

    const operation = {
      ...(tag ? { tags: [tag] } : {}),
      summary: flow.name || `${verb} ${pathKey}`,
      // A preserved operationId keeps generated client method names stable
      // across a re-export.
      operationId: uniqueOperationId(
        contract?.operationId || flow.name,
        `${method}${pathKey.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        operationIds
      ),
      ...(description ? { description } : {}),
      parameters: [...pathParams(pathSuffix, contract), ...contractParams(contract)],
      ...requestBodyFor(contract, verb, bodyVerbs),
      responses: responsesFor(contract),
      ...(differsFromGlobal && schemes.length ? { security: securityRequirement(schemes, schemeNames) } : {}),
    };
    if (!operation.parameters.length) delete operation.parameters;

    paths[pathKey][method] = operation;
  }

  const descriptionParts = [proxy.description || `Generated from the "${proxy.name}" Apigee proxy.`];
  if (collisions.length) {
    descriptionParts.push(
      `NOTE: ${collisions.length} flow${collisions.length === 1 ? '' : 's'} could not be documented because ` +
        `another flow already claims the same path and method: ${collisions.join(', ')}.`
    );
  }

  const doc = {
    openapi: '3.0.3',
    info: {
      title: proxy.name,
      description: descriptionParts.join('\n\n'),
      version: '1.0.0',
    },
    // On Apigee X the runtime hostname comes from the environment group you
    // attach the environment to — there is no default apigee.net host the way
    // there was on Edge. Left as an obvious placeholder to replace.
    servers: [
      {
        url: `https://YOUR-ENV-GROUP-HOSTNAME${proxy.basePath}`,
        description: 'Replace YOUR-ENV-GROUP-HOSTNAME with the hostname on the Apigee X environment group this proxy is deployed to.',
      },
    ],
    ...(tags.size ? { tags: [...tags].sort().map((name) => ({ name })) } : {}),
    paths,
    ...(Object.keys(securitySchemes).length
      ? {
          components: { securitySchemes },
          ...(globalDeduped.length ? { security: securityRequirement(globalDeduped, schemeNames) } : {}),
        }
      : {}),
  };

  return doc;
}
