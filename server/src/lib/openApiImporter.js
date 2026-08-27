import yaml from 'js-yaml';
import { nanoid } from 'nanoid';
import { escapeXml, XML_HEADER } from './xml.js';
import { slugify, normalizeProxy, buildFlowCondition } from './model.js';
import { resolveSchemaRefs, exampleFromSchema } from './flowContract.js';

// Prefer a JSON media type, then any structured one, then whatever is first —
// the exporters can only meaningfully pre-fill a body they can render as text.
function pickContent(content) {
  if (!content || typeof content !== 'object') return null;
  const types = Object.keys(content);
  if (!types.length) return null;
  const preferred =
    types.find((t) => /^application\/(json|.*\+json)$/i.test(t)) ||
    types.find((t) => /^application\/x-www-form-urlencoded$/i.test(t)) ||
    types.find((t) => /^(application\/xml|text\/xml)$/i.test(t)) ||
    types[0];
  return { contentType: preferred, media: content[preferred] || {} };
}

function stringifyExample(value, contentType) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (/json/i.test(contentType || '')) return JSON.stringify(value, null, 2);
  return String(value);
}

// OAS lets a media type carry either a single `example` or a map of named
// `examples`; take the first named one when there's no singular example.
function mediaExample(media, contentType) {
  if (media?.example !== undefined) return stringifyExample(media.example, contentType);
  const named = media?.examples && typeof media.examples === 'object' ? Object.values(media.examples)[0] : null;
  if (named && named.value !== undefined) return stringifyExample(named.value, contentType);
  return undefined;
}

function paramFromSpec(p, doc) {
  const schema = p.schema ? resolveSchemaRefs(p.schema, doc) : undefined;
  const example =
    p.example !== undefined
      ? String(p.example)
      : schema?.example !== undefined
        ? String(schema.example)
        : schema?.default !== undefined
          ? String(schema.default)
          : undefined;
  return {
    name: String(p.name),
    in: p.in === 'header' ? 'header' : p.in === 'path' ? 'path' : 'query',
    ...(p.required ? { required: true } : {}),
    ...(p.description ? { description: String(p.description) } : {}),
    ...(schema?.type ? { type: String(schema.type) } : {}),
    ...(Array.isArray(schema?.enum) && schema.enum.length ? { enumValues: schema.enum.map(String) } : {}),
    ...(example !== undefined && example !== '' ? { example } : {}),
  };
}

// Swagger 2.0 put body and formData in `parameters` rather than `requestBody`.
function swagger2Body(parameters, doc) {
  const bodyParam = parameters.find((p) => p.in === 'body');
  if (bodyParam) {
    const schema = bodyParam.schema ? resolveSchemaRefs(bodyParam.schema, doc) : undefined;
    const example = schema ? exampleFromSchema(schema) : null;
    return {
      contentType: 'application/json',
      ...(bodyParam.required ? { required: true } : {}),
      ...(schema ? { schema } : {}),
      ...(example !== null && example !== undefined
        ? { example: typeof example === 'string' ? example : JSON.stringify(example, null, 2) }
        : {}),
    };
  }
  const formParams = parameters.filter((p) => p.in === 'formData');
  if (formParams.length) {
    return {
      contentType: 'application/x-www-form-urlencoded',
      formParams: formParams.map((p) => paramFromSpec({ ...p, in: 'query' }, doc)),
    };
  }
  return undefined;
}

/**
 * Captures everything about an operation that Apigee itself discards but a
 * Postman collection or a re-exported spec needs: parameters with their
 * schemas and examples, the request body, and the documented responses.
 */
function contractFromOperation(operation, pathItem, doc, isSwagger2) {
  // Path-level parameters apply to every operation under that path, and an
  // operation-level parameter with the same name+location overrides them.
  const inherited = Array.isArray(pathItem?.parameters) ? pathItem.parameters : [];
  const own = Array.isArray(operation.parameters) ? operation.parameters : [];
  const merged = [...inherited, ...own].reduce((acc, p) => {
    if (!p || !p.name) return acc;
    const resolved = p.$ref ? resolveSchemaRefs(p, doc) : p;
    if (!resolved?.name) return acc;
    acc.set(`${resolved.in}:${resolved.name}`, resolved);
    return acc;
  }, new Map());
  const allParams = [...merged.values()];

  const params = allParams
    .filter((p) => ['query', 'header', 'path'].includes(p.in))
    .map((p) => paramFromSpec(p, doc));

  let body;
  if (isSwagger2) {
    body = swagger2Body(allParams, doc);
  } else if (operation.requestBody) {
    const rb = resolveSchemaRefs(operation.requestBody, doc);
    const picked = pickContent(rb.content);
    if (picked) {
      const schema = picked.media.schema ? resolveSchemaRefs(picked.media.schema, doc) : undefined;
      const explicit = mediaExample(picked.media, picked.contentType);
      const derived = schema ? exampleFromSchema(schema) : null;
      body = {
        contentType: picked.contentType,
        ...(rb.required ? { required: true } : {}),
        ...(schema ? { schema } : {}),
        ...(explicit !== undefined
          ? { example: explicit }
          : derived !== null && derived !== undefined
            ? { example: typeof derived === 'string' ? derived : JSON.stringify(derived, null, 2) }
            : {}),
      };
    }
  }

  const responses = Object.entries(operation.responses || {}).map(([status, raw]) => {
    const resp = resolveSchemaRefs(raw || {}, doc);
    const picked = pickContent(resp.content);
    return {
      status: String(status),
      ...(resp.description ? { description: String(resp.description) } : {}),
      ...(picked ? { contentType: picked.contentType } : {}),
      ...(picked ? { example: mediaExample(picked.media, picked.contentType) } : {}),
    };
  });

  return {
    ...(operation.operationId ? { operationId: String(operation.operationId) } : {}),
    params,
    ...(body ? { body } : {}),
    responses,
  };
}

// Order operations read top-to-bottom the way a human would expect, rather
// than however the spec author happened to order the verb keys per path.
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
const VERB_MAP = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE', options: 'OPTIONS', head: 'HEAD' };

// A Path Item Object holds operations *and* a handful of non-operation keys.
// Recognizing methods by an allowlist rather than by excluding known non-methods
// is what keeps `summary`/`description` from being reported as "unsupported HTTP
// methods" — `trace` is the only real method this app can't model, so it's the
// only one that should ever reach that warning.
const HTTP_METHOD_KEYS = new Set([...METHOD_ORDER, 'trace']);

function parseSpecText(specText) {
  const trimmed = specText.replace(/^﻿/, '').trim();
  if (!trimmed) throw new Error('Paste or upload an OpenAPI/Swagger spec first.');
  try {
    return { doc: JSON.parse(trimmed), ext: 'json' };
  } catch {
    // fall through to YAML
  }
  try {
    const doc = yaml.load(trimmed);
    if (!doc || typeof doc !== 'object') throw new Error('empty');
    return { doc, ext: 'yaml' };
  } catch {
    throw new Error("Couldn't parse this as JSON or YAML — check the spec is well-formed.");
  }
}


function resolveServerUrl(doc) {
  if (Array.isArray(doc.servers) && doc.servers[0]?.url) {
    let raw = String(doc.servers[0].url);
    const variables = doc.servers[0].variables || {};
    raw = raw.replace(/\{([^}]+)\}/g, (m, name) => (variables[name]?.default != null ? String(variables[name].default) : m));
    return raw;
  }
  if (doc.swagger === '2.0' && doc.host) {
    const scheme = Array.isArray(doc.schemes) && doc.schemes[0] ? doc.schemes[0] : 'https';
    return `${scheme}://${doc.host}${doc.basePath || ''}`;
  }
  return null;
}

export function parseOpenApiToProxy(specText) {
  const { doc, ext } = parseSpecText(specText);

  const isOas3 = typeof doc.openapi === 'string' && doc.openapi.startsWith('3');
  const isSwagger2 = doc.swagger === '2.0';
  if (!isOas3 && !isSwagger2) {
    throw new Error('Not a recognizable OpenAPI or Swagger document — missing an "openapi" or "swagger" version field.');
  }

  const warnings = [];
  const title = doc.info?.title || '';
  const proxyName = slugify(title) || 'openapi-import';

  const rawServerUrl = resolveServerUrl(doc);
  let targetOrigin = 'https://';
  let basePath = `/${slugify(title) || 'imported'}`;
  if (rawServerUrl) {
    try {
      const parsed = new URL(rawServerUrl);
      targetOrigin = parsed.origin;
      const pathname = parsed.pathname.replace(/\/+$/, '');
      if (pathname && pathname !== '') basePath = pathname;
    } catch {
      warnings.push(`This spec's server URL ("${rawServerUrl}") isn't absolute — set the Target Endpoint URL manually.`);
    }
  } else {
    warnings.push("This spec didn't declare an absolute server URL — set the Target Endpoint URL manually.");
  }

  const paths = doc.paths && typeof doc.paths === 'object' ? doc.paths : {};
  const flows = [];
  const skippedVerbs = new Set();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const presentMethods = Object.keys(pathItem).filter((k) => HTTP_METHOD_KEYS.has(k));
    const orderedMethods = [...METHOD_ORDER.filter((m) => presentMethods.includes(m)), ...presentMethods.filter((m) => !METHOD_ORDER.includes(m))];

    for (const method of orderedMethods) {
      const verb = VERB_MAP[method];
      if (!verb) {
        skippedVerbs.add(method);
        continue;
      }
      const operation = pathItem[method] || {};

      // Paths under `paths:` are always relative to `servers[0].url`, which
      // already carries the base path (e.g. ".../v1") — so a path key like
      // "/pets" maps directly onto Apigee's proxy.pathsuffix, unchanged.
      const pathValue = path;

      // `summary` is the operation's human label, so it becomes the flow's
      // name — that's what shows in the sidebar, the flow diagram and the
      // exported Postman item. Falling back to operationId then "VERB /path"
      // means there's always something, but "POST /help" is now the last
      // resort rather than the default.
      flows.push({
        id: nanoid(10),
        name: operation.summary || operation.operationId || `${verb} ${path}`,
        description: operation.description || operation.summary || '',
        conditionMode: 'simple',
        pathValue,
        pathOperator: 'MatchesPath',
        verb,
        condition: buildFlowCondition('MatchesPath', pathValue, verb),
        request: [],
        response: [],
        contract: contractFromOperation(operation, pathItem, doc, isSwagger2),
      });
    }
  }

  if (!flows.length) {
    warnings.push('No supported operations were found in this spec — the proxy was still created, but has no conditional flows.');
  } else {
    warnings.push(`Imported ${flows.length} operation${flows.length === 1 ? '' : 's'} across ${Object.keys(paths).length} path${Object.keys(paths).length === 1 ? '' : 's'}.`);
  }
  if (skippedVerbs.size) {
    warnings.push(`Skipped operation(s) using unsupported HTTP method(s): ${[...skippedVerbs].join(', ')}.`);
  }

  // apigeelint's PO007 rule expects OASValidation policy names to be
  // prefixed "oas" — matching it means a freshly-imported proxy lints clean.
  const validationPolicyName = 'oas-validate-request';
  const resourcePath = `resources/oas/spec.${ext}`;
  const validationPolicy = {
    id: nanoid(10),
    name: validationPolicyName,
    type: 'OASValidation',
    xml: `${XML_HEADER}<OASValidation continueOnError="false" enabled="true" name="${escapeXml(validationPolicyName)}">
    <DisplayName>${escapeXml(validationPolicyName)}</DisplayName>
    <Source>request</Source>
    <OASResource>oas://spec.${ext}</OASResource>
</OASValidation>`,
    resource: { path: resourcePath, content: specText },
  };

  const proxy = {
    id: nanoid(10),
    name: proxyName,
    basePath,
    description: doc.info?.description || title || 'Imported from an OpenAPI/Swagger spec.',
    proxyEndpointName: 'default',
    policies: [validationPolicy],
    targets: [
      {
        id: nanoid(8),
        name: 'default',
        description: 'Default Target Endpoint',
        mode: 'url',
        url: { mode: 'literal', value: targetOrigin },
        targetServers: [],
        preFlow: { request: [], response: [] },
        postFlow: { request: [], response: [] },
        flows: [],
        faultRules: { steps: [] },
      },
    ],
    preFlow: { request: [{ policyName: validationPolicyName }], response: [] },
    postFlow: { request: [], response: [] },
    flows,
    routeRules: [{ id: nanoid(8), name: 'default', targetName: 'default', condition: '' }],
    faultRules: { steps: [] },
    lintExcludes: [],
    environments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { proxy: normalizeProxy(proxy), warnings };
}
