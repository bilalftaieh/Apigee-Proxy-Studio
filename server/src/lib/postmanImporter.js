import { nanoid } from 'nanoid';
import { slugify, normalizeProxy, buildFlowCondition } from './model.js';

const KNOWN_VERBS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);

// Postman text fields (folder/request/collection descriptions) come either
// as a plain string or as { content, type } — normalize to a plain string.
function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.content === 'string') return value.content;
  return '';
}

function resolveVariables(str, variables) {
  if (typeof str !== 'string') return '';
  return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, name) => (variables.has(name) ? variables.get(name) : m));
}

// A `:name` path segment (Postman's path-variable syntax) is rewritten to
// Apigee's `{name}` — the same segment-wildcard syntax the OpenAPI importer
// already relies on, so both importers produce visually consistent flows.
function normalizeSegment(segment, variables) {
  const resolved = resolveVariables(segment, variables);
  if (resolved.startsWith(':')) return `{${resolved.slice(1)}}`;
  const asVar = resolved.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (asVar) return `{${asVar[1]}}`;
  return resolved;
}

function normalizePathname(pathname, variables) {
  const segs = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((s) => normalizeSegment(s, variables));
  return segs.length ? `/${segs.join('/')}` : '/';
}

// Flattens Postman's recursive folder tree (`item` containing nested `item`
// arrays) into a flat list of { name, request, breadcrumb }.
function flattenItems(items, breadcrumb = []) {
  const out = [];
  for (const item of items || []) {
    if (Array.isArray(item.item)) {
      out.push(...flattenItems(item.item, [...breadcrumb, item.name]));
    } else if (item.request) {
      out.push({ name: item.name, request: item.request, breadcrumb, item });
    }
  }
  return out;
}

// A Postman `url` is either a raw string or a structured object with its own
// `path`/`host` arrays — resolve both shapes down to { pathValue, originRaw }.
function resolveUrl(url, variables) {
  if (!url) return null;
  if (typeof url === 'string') {
    const raw = resolveVariables(url, variables);
    try {
      const parsed = new URL(raw);
      // Run the same per-segment normalization the structured form gets, so a
      // `:id` in a string URL becomes `{id}` too — otherwise one collection
      // could yield two different path notations depending on how each request
      // happened to be saved.
      return { pathValue: normalizePathname(parsed.pathname, variables), originRaw: parsed.origin };
    } catch {
      return null;
    }
  }
  const pathSegments = Array.isArray(url.path) ? url.path.map((s) => normalizeSegment(s, variables)) : null;
  const rawResolved = resolveVariables(url.raw || '', variables);
  let originRaw = null;
  try {
    originRaw = new URL(rawResolved).origin;
  } catch {
    // host may still be usable even if the full raw URL doesn't parse (unresolved path variables, etc.)
    if (Array.isArray(url.host)) {
      const hostJoined = url.host.map((h) => resolveVariables(h, variables)).join('.');
      try {
        originRaw = new URL(hostJoined.includes('://') ? hostJoined : `https://${hostJoined}`).origin;
      } catch {
        originRaw = null;
      }
    }
  }
  if (pathSegments) {
    return { pathValue: pathSegments.length ? `/${pathSegments.join('/')}` : '/', originRaw };
  }
  if (rawResolved) {
    try {
      return { pathValue: normalizePathname(new URL(rawResolved).pathname, variables), originRaw };
    } catch {
      return null;
    }
  }
  return null;
}

// Postman marks a disabled query param / header with `disabled: true`; those are
// still worth keeping (the author left them there deliberately) but they carry
// through as optional rather than required.
function paramsFromPostman(list, location, variables) {
  return (list || [])
    .filter((p) => p && p.key)
    .map((p) => {
      const value = resolveVariables(String(p.value ?? ''), variables);
      return {
        name: String(p.key),
        in: location,
        ...(p.disabled ? {} : { required: true }),
        ...(textOf(p.description) ? { description: textOf(p.description) } : {}),
        ...(value ? { example: value } : {}),
      };
    });
}

// Postman body modes: raw (any text), urlencoded / formdata (key-value), file
// and graphql. Only the first three round-trip into something an exporter can
// resend, and `options.raw.language` tells us the content type for raw bodies.
function bodyFromPostman(request, variables) {
  const body = request.body;
  if (!body || typeof body !== 'object') return undefined;

  if (body.mode === 'raw' && typeof body.raw === 'string' && body.raw.trim()) {
    const language = body.options?.raw?.language;
    const explicit = (request.header || []).find((h) => String(h.key || '').toLowerCase() === 'content-type');
    const contentType =
      (explicit && resolveVariables(String(explicit.value || ''), variables)) ||
      (language === 'xml' ? 'application/xml' : language === 'text' ? 'text/plain' : 'application/json');
    return { contentType, required: true, example: resolveVariables(body.raw, variables) };
  }

  if (body.mode === 'urlencoded' || body.mode === 'formdata') {
    const formParams = paramsFromPostman(body[body.mode], 'query', variables);
    if (!formParams.length) return undefined;
    return {
      contentType: body.mode === 'urlencoded' ? 'application/x-www-form-urlencoded' : 'multipart/form-data',
      required: true,
      formParams,
    };
  }

  return undefined;
}

// A saved example response on a Postman request is the most valuable thing in
// the collection for documentation purposes — it's a real captured payload.
function responsesFromPostman(item) {
  return (item.response || [])
    .filter((r) => r && (r.code || r.status))
    .map((r) => ({
      status: String(r.code || r.status),
      ...(r.name ? { description: String(r.name) } : {}),
      ...(typeof r.body === 'string' && r.body.trim() ? { example: r.body } : {}),
    }));
}

// Content-Type is derived from the body rather than carried as a parameter, and
// auth headers are re-generated by the exporter from the detected security
// policies — keeping either here would produce duplicates on re-export.
const HEADERS_OWNED_ELSEWHERE = new Set(['content-type', 'authorization']);

function contractFromPostmanItem(item, request, variables) {
  const url = typeof request.url === 'object' && request.url ? request.url : {};
  const params = [
    ...paramsFromPostman(url.query, 'query', variables),
    ...paramsFromPostman(
      (request.header || []).filter((h) => !HEADERS_OWNED_ELSEWHERE.has(String(h.key || '').toLowerCase())),
      'header',
      variables
    ),
    ...paramsFromPostman(url.variable, 'path', variables),
  ];
  const body = bodyFromPostman(request, variables);
  const responses = responsesFromPostman(item);
  return { params, ...(body ? { body } : {}), responses };
}

export function parsePostmanToProxy(collectionText) {
  const trimmed = collectionText.replace(/^﻿/, '').trim();
  if (!trimmed) throw new Error('Paste or upload a Postman collection first.');

  let doc;
  try {
    doc = JSON.parse(trimmed);
  } catch {
    throw new Error("Couldn't parse this as JSON — Postman collections are exported as .json.");
  }

  if (!Array.isArray(doc.item)) {
    throw new Error(
      Array.isArray(doc.requests)
        ? "This looks like a Postman Collection v1 export, which isn't supported — re-export as v2.1 from Postman (Export > Collection v2.1)."
        : 'Not a recognizable Postman collection — missing the top-level "item" array.'
    );
  }

  const warnings = [];
  const title = doc.info?.name || '';
  const proxyName = slugify(title) || 'postman-import';

  const variables = new Map();
  for (const v of doc.variable || []) {
    if (v?.key != null && v.value != null) variables.set(String(v.key), String(v.value));
  }

  const flatItems = flattenItems(doc.item);

  let targetOrigin = null;
  const flows = [];
  const seen = new Set();
  let unresolvedCount = 0;
  let skippedVerbCount = 0;
  let duplicateCount = 0;

  for (const { name, request, breadcrumb, item } of flatItems) {
    const resolved = resolveUrl(request.url, variables);
    if (!resolved) {
      unresolvedCount++;
      continue;
    }
    if (!targetOrigin && resolved.originRaw) targetOrigin = resolved.originRaw;

    const verb = String(request.method || 'GET').toUpperCase();
    if (!KNOWN_VERBS.has(verb)) {
      skippedVerbCount++;
      continue;
    }

    // Two requests on the same verb+path would generate two flows with the same
    // condition, and only the first could ever match — so the duplicate is
    // dropped. Counted, not silent: a collection that keeps one request per
    // environment looks like it imported cleanly while losing most of itself.
    const key = `${verb} ${resolved.pathValue}`;
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);

    const description = textOf(request.description) || breadcrumb.join(' / ');
    const pathValue = resolved.pathValue === '/' ? '' : resolved.pathValue;

    // The Postman item's own name is the human label the author chose — use it
    // rather than regenerating "VERB /path", which is only the fallback for an
    // unnamed request.
    flows.push({
      id: nanoid(10),
      name: name || key,
      description,
      conditionMode: 'simple',
      pathValue,
      pathOperator: 'MatchesPath',
      verb,
      condition: buildFlowCondition('MatchesPath', pathValue, verb),
      request: [],
      response: [],
      contract: contractFromPostmanItem(item || {}, request, variables),
    });
  }

  if (!flows.length) {
    warnings.push('No usable requests were found in this collection — the proxy was still created, but has no conditional flows.');
  } else {
    warnings.push(`Imported ${flows.length} request${flows.length === 1 ? '' : 's'} as conditional flows.`);
  }
  if (unresolvedCount) {
    warnings.push(`Skipped ${unresolvedCount} request(s) whose URL couldn't be resolved to a usable path (unresolved {{variables}} with no matching collection variable) — set them up by hand.`);
  }
  if (skippedVerbCount) {
    warnings.push(`Skipped ${skippedVerbCount} request(s) using an unsupported HTTP method.`);
  }
  if (duplicateCount) {
    warnings.push(`Merged ${duplicateCount} duplicate request(s) that shared a method and path with an earlier one — one conditional flow covers them all.`);
  }
  if (doc.auth) {
    warnings.push(`This collection declares "${doc.auth.type || 'an'}" auth at the collection level — that wasn't scaffolded; add the matching security policy by hand.`);
  }
  if (!targetOrigin) {
    warnings.push("Couldn't resolve an absolute URL from any request in this collection — set the Target Endpoint URL manually.");
    targetOrigin = 'https://';
  }

  const proxy = {
    id: nanoid(10),
    name: proxyName,
    basePath: `/${slugify(title) || 'imported'}`,
    description: textOf(doc.info?.description) || title || 'Imported from a Postman collection.',
    proxyEndpointName: 'default',
    policies: [],
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
    preFlow: { request: [], response: [] },
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
