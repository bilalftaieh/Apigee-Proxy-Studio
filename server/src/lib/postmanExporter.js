import postman from 'postman-collection';
import { detectSecuritySchemes } from './authDetect.js';
import { routeOfFlow } from './model.js';
import { bodyExampleText, paramExampleText, paramsIn } from './flowContract.js';
import { detectRequestFields } from './requestFieldsDetect.js';

const { Collection, Item, ItemGroup, RequestAuth } = postman;

function segments(pathValue) {
  return String(pathValue || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Apigee's `{name}` wildcard segment becomes Postman's `:name` — the syntax
// Postman's URL bar recognizes as a path variable and breaks out into its
// own editable "Path Variables" tab.
function toPostmanSegment(seg) {
  const m = seg.match(/^\{([^}]+)\}$/);
  return m ? `:${m[1]}` : seg;
}

function pathVariablesOf(seg) {
  const m = seg.match(/^\{([^}]+)\}$/);
  return m ? [m[1]] : [];
}

const schemeKey = (s) => (s.kind === 'apiKey' ? `apiKey:${s.in}:${s.paramName}` : `${s.kind}:${s.headerName || ''}`);

function dedupeSchemes(schemes) {
  const seen = new Set();
  const out = [];
  for (const s of schemes) {
    const key = schemeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Order-independent: the old JSON.stringify comparison treated the same two
// schemes in a different order as "different", which stamped a redundant auth
// block on requests that should just inherit the collection default.
function sameSchemeSet(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b.map(schemeKey));
  return a.every((s) => setB.has(schemeKey(s)));
}

// Postman's `auth` block accepts exactly one scheme per request, so when a
// flow is guarded by both an API key and a bearer/JWT check (uncommon but
// legal), the bearer wins the `auth` slot and the API key is layered on top
// as a plain header/query param instead of being silently dropped.
function buildAuthDefinition(schemes) {
  const bearer = schemes.find((s) => s.kind === 'oauth2' || s.kind === 'jwt');
  const apiKey = schemes.find((s) => s.kind === 'apiKey');

  const extraHeaders = [];
  const extraQuery = [];
  let auth;

  if (bearer) {
    auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] };
    if (apiKey) {
      if (apiKey.in === 'header') extraHeaders.push({ key: apiKey.paramName, value: '{{apiKey}}' });
      else extraQuery.push({ key: apiKey.paramName, value: '{{apiKey}}' });
    }
  } else if (apiKey) {
    auth = {
      type: 'apikey',
      apikey: [
        { key: 'key', value: apiKey.paramName, type: 'string' },
        { key: 'value', value: '{{apiKey}}', type: 'string' },
        { key: 'in', value: apiKey.in, type: 'string' },
      ],
    };
  } else {
    auth = { type: 'noauth' };
  }

  return { auth, extraHeaders, extraQuery };
}

function mergeFields(...fieldSets) {
  const queryParams = [...new Set(fieldSets.flatMap((f) => f.queryParams))];
  const formParams = [...new Set(fieldSets.flatMap((f) => f.formParams))];
  const jsonFields = fieldSets.flatMap((f) => f.jsonFields);
  return { queryParams, formParams, jsonFields };
}

function setNestedField(obj, path, value) {
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

// Builds a JSON body example from every JSONPayload field an ExtractVariables
// policy in this flow's path declares it reads — so a POST/PUT/PATCH request
// arrives with the shape the proxy actually expects instead of an empty `{}`.
function buildJsonBody(jsonFields) {
  const example = {};
  for (const field of jsonFields) setNestedField(example, field.path, field.value);
  return JSON.stringify(example, null, 2);
}

function normalizeSuffix(pathSuffix) {
  return `/${String(pathSuffix || '').replace(/^\/+|\/+$/g, '')}`;
}

// A saved Test Case (Tests tab) is a request the proxy author already typed
// real values into to exercise this exact flow — the same "your studio's own
// structured data" source the plan calls out as the best one available, so
// its concrete query/header/body values take priority over ExtractVariables'
// field-name-only skeleton wherever the two overlap.
function matchTestCase(tests, verb, pathSuffix) {
  const target = normalizeSuffix(pathSuffix);
  return (tests || []).find((t) => t.request?.verb === verb && normalizeSuffix(t.request.pathSuffix) === target) || null;
}

// Precedence for every value in the generated request, weakest to strongest:
//   1. nothing            -> empty placeholder
//   2. ExtractVariables   -> field *names* the proxy reads, no values
//   3. Flow.contract      -> names + types + examples captured at import
//   4. a saved Test Case  -> values the author actually ran against the proxy
// Later sources overwrite earlier ones for the same key and add anything new.
function buildRequestDefinition(flow, schemes, basePathSegments, fields, tests) {
  const { verb, pathSuffix } = routeOfFlow(flow);
  const contract = flow.contract;
  const rawSegments = segments(pathSuffix);
  const postmanSegments = rawSegments.map(toPostmanSegment);
  const pathVars = rawSegments.flatMap(pathVariablesOf);
  const testCase = matchTestCase(tests, verb, pathSuffix);

  const { auth, extraHeaders, extraQuery } = buildAuthDefinition(schemes);
  const header = extraHeaders.map((h) => ({ ...h, type: 'text' }));

  // --- query ---------------------------------------------------------------
  const query = [...extraQuery];
  const upsertQuery = (key, value, extra = {}) => {
    const existing = query.find((q) => q.key === key);
    if (existing) Object.assign(existing, value !== undefined ? { value } : {}, extra);
    else query.push({ key, value: value ?? '', ...extra });
  };
  for (const name of fields.queryParams) upsertQuery(name, undefined);
  for (const p of paramsIn(contract, 'query')) {
    // Optional params ship disabled so the request runs out of the box with
    // only what the operation actually requires — Postman's own convention.
    upsertQuery(p.name, paramExampleText(p), {
      ...(p.required ? {} : { disabled: true }),
      ...(p.description ? { description: p.description } : {}),
    });
  }
  for (const [key, value] of Object.entries(testCase?.request?.queryParams || {})) {
    upsertQuery(key, value, { disabled: false });
  }

  // --- headers -------------------------------------------------------------
  const upsertHeader = (key, value, extra = {}) => {
    const existing = header.find((h) => h.key.toLowerCase() === key.toLowerCase());
    if (existing) Object.assign(existing, value !== undefined ? { value } : {}, extra);
    else header.push({ key, value: value ?? '', type: 'text', ...extra });
  };
  for (const p of paramsIn(contract, 'header')) {
    upsertHeader(p.name, paramExampleText(p), {
      ...(p.required ? {} : { disabled: true }),
      ...(p.description ? { description: p.description } : {}),
    });
  }

  // --- body ----------------------------------------------------------------
  const bodyVerbs = new Set(['POST', 'PUT', 'PATCH']);
  let body;
  const contractBody = contract?.body;
  if (testCase?.request?.body) {
    const isXml = testCase.request.body.trim().startsWith('<');
    upsertHeader('Content-Type', isXml ? 'application/xml' : 'application/json');
    body = { mode: 'raw', raw: testCase.request.body, options: { raw: { language: isXml ? 'xml' : 'json' } } };
  } else if (contractBody?.formParams?.length) {
    upsertHeader('Content-Type', contractBody.contentType);
    const mode = contractBody.contentType.includes('multipart') ? 'formdata' : 'urlencoded';
    body = {
      mode,
      [mode]: contractBody.formParams.map((p) => ({
        key: p.name,
        value: paramExampleText(p),
        type: 'text',
        ...(p.required ? {} : { disabled: true }),
      })),
    };
  } else if (contractBody) {
    const raw = bodyExampleText(contractBody);
    if (raw != null) {
      upsertHeader('Content-Type', contractBody.contentType);
      const language = /xml/i.test(contractBody.contentType) ? 'xml' : /json/i.test(contractBody.contentType) ? 'json' : 'text';
      body = { mode: 'raw', raw, options: { raw: { language } } };
    }
  }
  if (!body && bodyVerbs.has(verb)) {
    if (fields.formParams.length) {
      upsertHeader('Content-Type', 'application/x-www-form-urlencoded');
      body = { mode: 'urlencoded', urlencoded: fields.formParams.map((name) => ({ key: name, value: '' })) };
    } else {
      upsertHeader('Content-Type', 'application/json');
      body = {
        mode: 'raw',
        raw: fields.jsonFields.length ? buildJsonBody(fields.jsonFields) : '{\n  \n}',
        options: { raw: { language: 'json' } },
      };
    }
  }

  for (const [key, value] of Object.entries(testCase?.request?.headers || {})) {
    upsertHeader(key, value, { disabled: false });
  }

  // --- path variables ------------------------------------------------------
  const declaredPathParams = new Map(paramsIn(contract, 'path').map((p) => [p.name, p]));
  const variable = pathVars.map((name) => {
    const known = declaredPathParams.get(name);
    return {
      key: name,
      value: known ? paramExampleText(known) : '',
      ...(known?.description ? { description: known.description } : {}),
    };
  });

  return {
    // The flow's own name is the label the author chose — "Request Help", not
    // "POST /help". The verb+path form is only the fallback for an unnamed flow.
    name: flow.name || `${verb} ${pathSuffix || '/'}`,
    request: {
      method: verb,
      header,
      ...(body ? { body } : {}),
      url: {
        host: ['{{baseUrl}}'],
        path: [...basePathSegments, ...postmanSegments],
        ...(query.length ? { query } : {}),
        ...(variable.length ? { variable } : {}),
      },
      auth,
      description: flow.description || undefined,
    },
    // Saved example responses make the collection readable as documentation,
    // not just runnable.
    ...(contract?.responses?.some((r) => r.example)
      ? {
          response: contract.responses
            .filter((r) => r.example)
            .map((r) => ({
              name: r.description || `${r.status} response`,
              code: Number(r.status) || 200,
              status: r.description || undefined,
              header: r.contentType ? [{ key: 'Content-Type', value: r.contentType }] : [],
              body: r.example,
              _postman_previewlanguage: /json/i.test(r.contentType || '') ? 'json' : 'text',
            })),
        }
      : {}),
  };
}

// Converts this app's proxy model into a Postman Collection v2.1 document
// using the official `postman-collection` SDK, so the JSON we hand back is
// guaranteed schema-valid rather than hand-assembled and hopeful.
export function generatePostmanCollection(proxy) {
  const { global, perFlow } = detectSecuritySchemes(proxy);
  const globalDeduped = dedupeSchemes(global);
  const { global: globalFields, perFlow: perFlowFields } = detectRequestFields(proxy);

  const everyScheme = [...globalDeduped, ...[...perFlow.values()].flat()];
  const hasApiKeyScheme = everyScheme.some((s) => s.kind === 'apiKey');
  const hasBearerScheme = everyScheme.some((s) => s.kind === 'oauth2' || s.kind === 'jwt');

  // On Apigee X the runtime hostname is whatever you configured on the
  // environment group — there's no default apigee.net host as there was on Edge.
  const variable = [
    {
      key: 'baseUrl',
      value: 'https://YOUR-ENV-GROUP-HOSTNAME',
      description:
        'Runtime host for this proxy: the hostname on the Apigee X environment group your environment belongs to (Admin > Environments > Environment groups). No trailing slash.',
    },
  ];
  if (hasApiKeyScheme) variable.push({ key: 'apiKey', value: '', description: 'API key sent with every request that requires one.' });
  if (hasBearerScheme) variable.push({ key: 'accessToken', value: '', description: 'Bearer token (OAuth2 access token or JWT) sent as Authorization: Bearer {{accessToken}}.' });

  const descriptionLines = [proxy.description || `Requests for the "${proxy.name}" Apigee proxy.`, '', `Base path: ${proxy.basePath}`];
  if (proxy.updatedAt) descriptionLines.push(`Generated from proxy state last saved ${new Date(proxy.updatedAt).toISOString()} — re-export after further changes to keep this in sync.`);
  if (globalDeduped.length) {
    descriptionLines.push(
      `Auth: every request requires ${globalDeduped
        .map((s) => (s.kind === 'apiKey' ? `an API key (${s.in}: ${s.paramName})` : 'a bearer token'))
        .join(' and ')} — set it in the collection variables.`
    );
  }

  const collection = new Collection({
    info: {
      name: proxy.name,
      description: descriptionLines.join('\n'),
      schema: 'https://schema.postman.com/json/collection/v2.1.0/collection.json',
    },
    variable,
  });

  const { auth: collectionAuth } = buildAuthDefinition(globalDeduped);
  if (collectionAuth.type !== 'noauth') collection.auth = new RequestAuth(collectionAuth);

  const basePathSegments = segments(proxy.basePath).map(toPostmanSegment);

  // Group by the first path segment, the way a hand-organized collection is
  // laid out. Requests that don't share a resource root stay at the top level
  // rather than sitting in a folder of one.
  const definitionsByFolder = new Map();
  for (const flow of proxy.flows || []) {
    const schemes = dedupeSchemes([...global, ...(perFlow.get(flow.id) || [])]);
    const fields = mergeFields(globalFields, perFlowFields.get(flow.id) || { queryParams: [], formParams: [], jsonFields: [] });
    const definition = buildRequestDefinition(flow, schemes, basePathSegments, fields, proxy.tests);
    // A request whose auth matches the collection-wide default just inherits
    // it — dropping the field keeps every unguarded/uniformly-guarded
    // request visually clean instead of repeating the same auth block N times.
    if (sameSchemeSet(schemes, globalDeduped)) {
      delete definition.request.auth;
    }
    const { pathSuffix } = routeOfFlow(flow);
    const first = segments(pathSuffix)[0];
    const folder = first && !first.startsWith('{') ? first : '';
    if (!definitionsByFolder.has(folder)) definitionsByFolder.set(folder, []);
    definitionsByFolder.get(folder).push(definition);
  }

  for (const [folder, definitions] of [...definitionsByFolder.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!folder || definitions.length < 2) {
      definitions.forEach((d) => collection.items.add(new Item(d)));
      continue;
    }
    collection.items.add(new ItemGroup({ name: folder, item: definitions }));
  }

  return collection.toJSON();
}
