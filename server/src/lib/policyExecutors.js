// Executes a policy's actual XML against the shared test context. Keyed by
// the *real* root XML tag (parsed from policy.xml), not policy.type — the
// gallery type is just metadata (see policyTemplates.js: CorsHeaders has
// xmlTag "AssignMessage"), and the XML is hand-editable in Monaco, so the
// tag actually present is the only reliable signal of what to execute.
//
// Types with no handler here (PythonScript, JavaCallout, Quota, KVM, ...)
// come back as `{ emulated: false }` from executePolicy — the runner surfaces
// those as "not emulated" rather than silently treating them as no-ops that
// passed.
import { XMLParser } from 'fast-xml-parser';
import vm from 'node:vm';
import { getVariable, setVariable, getHeader, setHeader, removeHeader, listHeaders, renderTemplate, FaultError } from './testContext.js';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function parsePolicyXml(policy) {
  try {
    return xmlParser.parse(policy.xml);
  } catch (err) {
    throw new FaultError({ message: `Policy "${policy.name}" has malformed XML: ${err.message}`, status: 500 });
  }
}

function rootTagOf(parsed) {
  return Object.keys(parsed).find((k) => k !== '?xml');
}

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'object') return node['#text'] != null ? String(node['#text']) : '';
  return String(node);
}

function attr(node, name) {
  return node?.[`@_${name}`];
}

function ignoreUnresolvedOf(root) {
  return root.IgnoreUnresolvedVariables === undefined ? true : String(textOf(root.IgnoreUnresolvedVariables)).toLowerCase() !== 'false';
}

function messageFor(root, ctx) {
  const assignTo = root.AssignTo;
  const explicitType = assignTo ? attr(assignTo, 'type') : undefined;
  const type = explicitType || ctx.phase;
  const msg = type === 'response' ? ctx.response : ctx.request;
  if (!msg) throw new FaultError({ message: `AssignMessage targets "${type}", which doesn't exist yet in this flow`, status: 500 });
  return msg;
}

// ---------------------------------------------------------------- AssignMessage
function execAssignMessage(policy, root, ctx) {
  const ignoreUnresolved = ignoreUnresolvedOf(root);
  const msg = messageFor(root, ctx);
  const render = (s) => renderTemplate(s, ctx, { ignoreUnresolved, policyName: policy.name });

  // Set and Add are both treated as "apply" here — this emulation can't
  // represent Add's true append-duplicate-header semantics since headers
  // are a single-value map, only Set's replace semantics.
  function applyPositiveBlock(block) {
    if (!block) return;
    if (block.Headers) {
      for (const h of asArray(block.Headers.Header)) {
        const name = attr(h, 'name');
        if (name) setHeader(msg, name, render(textOf(h)));
      }
    }
    if (block.QueryParams) {
      for (const qp of asArray(block.QueryParams.QueryParam)) {
        const name = attr(qp, 'name');
        if (name) msg.queryParams[name] = render(textOf(qp));
      }
    }
    if (block.Payload !== undefined) msg.content = render(textOf(block.Payload));
    if (block.StatusCode !== undefined) msg.status = Number(render(textOf(block.StatusCode)));
    if (block.ReasonPhrase !== undefined) msg.reasonPhrase = render(textOf(block.ReasonPhrase));
  }

  function applyRemoveBlock(block) {
    if (!block) return;
    if (block.Headers) {
      for (const h of asArray(block.Headers.Header)) {
        const name = attr(h, 'name');
        if (name) removeHeader(msg, name);
      }
    }
    if (block.QueryParams) {
      for (const qp of asArray(block.QueryParams.QueryParam)) {
        const name = attr(qp, 'name');
        if (name) delete msg.queryParams[name];
      }
    }
  }

  applyPositiveBlock(root.Set);
  applyPositiveBlock(root.Add);
  applyRemoveBlock(root.Remove);

  if (root.Copy) {
    const sourceType = attr(root.Copy, 'source') || ctx.phase;
    const sourceMsg = sourceType === 'response' ? ctx.response : ctx.request;
    if (sourceMsg) {
      if (root.Copy.Headers) {
        for (const h of asArray(root.Copy.Headers.Header)) {
          const name = attr(h, 'name');
          const value = name ? getHeader(sourceMsg, name) : undefined;
          if (name && value !== undefined) setHeader(msg, name, value);
        }
      }
      if (root.Copy.StatusCode !== undefined) msg.status = sourceMsg.status;
    }
  }

  for (const av of asArray(root.AssignVariable)) {
    const name = textOf(av.Name);
    if (!name) continue;
    let value;
    if (av.Value !== undefined) value = render(textOf(av.Value));
    else if (av.Ref !== undefined) value = getVariable(ctx, textOf(av.Ref));
    if (value === undefined && av.Template !== undefined) value = render(textOf(av.Template));
    setVariable(ctx, name, value ?? '');
  }
}

// -------------------------------------------------------------------- RaiseFault
function execRaiseFault(policy, root) {
  const ignoreUnresolved = ignoreUnresolvedOf(root);
  return (ctx) => {
    const render = (s) => renderTemplate(s, ctx, { ignoreUnresolved, policyName: policy.name });
    const set = root.FaultResponse?.Set;
    const fault = { message: `RaiseFault policy "${policy.name}" raised a fault`, policyName: policy.name, status: 500, headers: {} };
    if (set) {
      if (set.StatusCode !== undefined) fault.status = Number(render(textOf(set.StatusCode)));
      if (set.ReasonPhrase !== undefined) fault.reasonPhrase = render(textOf(set.ReasonPhrase));
      if (set.Payload !== undefined) fault.payload = render(textOf(set.Payload));
      if (set.Headers) {
        for (const h of asArray(set.Headers.Header)) {
          const name = attr(h, 'name');
          if (name) fault.headers[name] = render(textOf(h));
        }
      }
    }
    throw new FaultError(fault);
  };
}

// --------------------------------------------------------------- ExtractVariables
// Apigee extraction patterns mix literal text, `{varName}` captures and
// `*`/`**` wildcards — e.g. "/{resource}/*". Converts one to a regex plus the
// ordered list of names to bind on a match.
function buildExtractRegex(pattern) {
  const names = [];
  let regex = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '{') {
      const end = pattern.indexOf('}', i);
      if (end === -1) {
        regex += '\\{';
        i++;
        continue;
      }
      names.push(pattern.slice(i + 1, end));
      regex += '(.*?)';
      i = end + 1;
      continue;
    }
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        regex += '.*';
        i += 2;
        continue;
      }
      regex += '[^/]*';
      i++;
      continue;
    }
    regex += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
    i++;
  }
  return { regex: new RegExp(`^${regex}$`), names };
}

function extractFrom(value, patternNodes, ctx, prefix) {
  for (const patNode of asArray(patternNodes)) {
    const { regex, names } = buildExtractRegex(textOf(patNode));
    const m = regex.exec(value ?? '');
    if (m) {
      names.forEach((name, idx) => setVariable(ctx, prefix ? `${prefix}.${name}` : name, m[idx + 1] ?? ''));
      return true;
    }
  }
  return false;
}

// Resolves Apigee's simplified JSONPath dialect against an already-parsed
// JSON value: dotted field access plus `[n]` array indexing (e.g.
// `$.items[0].id`). Not a full JSONPath implementation (no wildcards/filters)
// — that's all ExtractVariables' JSONPayload actually supports.
function evalJsonPath(value, path) {
  let expr = String(path ?? '').trim();
  if (expr.startsWith('$')) expr = expr.slice(1);
  if (expr.startsWith('.')) expr = expr.slice(1);
  if (!expr) return value;

  const tokenPattern = /([^.[\]]+)|\[(\d+)\]/g;
  let cur = value;
  let m;
  while ((m = tokenPattern.exec(expr))) {
    if (cur == null) return undefined;
    cur = cur[m[1] !== undefined ? m[1] : Number(m[2])];
  }
  return cur;
}

function execExtractVariables(policy, root) {
  return (ctx) => {
    const notes = [];
    const sourceType = root.Source !== undefined ? textOf(root.Source) : 'request';
    const msg = sourceType === 'response' ? ctx.response : sourceType === 'request' ? ctx.request : undefined;
    const sourceValue = msg ? msg.content : getVariable(ctx, sourceType);
    if (msg === undefined && sourceValue === undefined) {
      notes.push(`Source "${sourceType}" isn't available yet at this point in the flow`);
      return notes;
    }
    const prefix = root.VariablePrefix !== undefined ? textOf(root.VariablePrefix) : undefined;

    if (msg) {
      if (root.URIPath) extractFrom(msg.pathSuffix, root.URIPath.Pattern, ctx, prefix);
      for (const qp of asArray(root.QueryParam)) {
        const name = attr(qp, 'name');
        if (name) extractFrom(msg.queryParams?.[name], qp.Pattern, ctx, prefix);
      }
      for (const hdr of asArray(root.Header)) {
        const name = attr(hdr, 'name');
        if (name) extractFrom(getHeader(msg, name), hdr.Pattern, ctx, prefix);
      }
    }
    for (const v of asArray(root.Variable)) {
      const name = attr(v, 'name');
      if (name) extractFrom(getVariable(ctx, name), v.Pattern, ctx, prefix);
    }

    if (root.JSONPayload) {
      let parsedBody;
      try {
        parsedBody = sourceValue ? JSON.parse(sourceValue) : undefined;
      } catch (err) {
        notes.push(`JSONPayload: source isn't valid JSON (${err.message})`);
        parsedBody = undefined;
      }
      if (parsedBody !== undefined) {
        for (const v of asArray(root.JSONPayload.Variable)) {
          const name = attr(v, 'name');
          if (!name || v.JSONPath === undefined) continue;
          const value = evalJsonPath(parsedBody, textOf(v.JSONPath));
          if (value !== undefined && value !== null) {
            setVariable(ctx, prefix ? `${prefix}.${name}` : name, typeof value === 'string' ? value : JSON.stringify(value));
          }
        }
      }
    }

    if (root.FormParam) notes.push('FormParam extraction not emulated (form-encoded body parsing not implemented)');
    if (root.JSONPath) notes.push('Top-level JSONPath extraction not emulated');
    if (root.XPath) notes.push('XPath extraction not emulated');
    return notes;
  };
}

// ---------------------------------------------------------------------- Javascript
function messageShim(msg) {
  if (!msg) return undefined;
  return {
    getHeader: (name) => getHeader(msg, name),
    setHeader: (name, value) => setHeader(msg, name, value),
    removeHeader: (name) => removeHeader(msg, name),
    headerNames: () => listHeaders(msg).map((h) => h.name),
    get content() {
      return msg.content;
    },
    set content(v) {
      msg.content = String(v);
    },
    get verb() {
      return msg.verb;
    },
    get queryParams() {
      return { ...msg.queryParams };
    },
    get statusCode() {
      return msg.status;
    },
    set statusCode(v) {
      msg.status = Number(v);
    },
  };
}

// Resolves the policy's script from the bundle's resource collection, honoring
// <IncludeURL> the way Apigee does: every included file is evaluated, in
// document order, in the same scope, before the policy's own <ResourceURL>
// script runs — which is what makes a shared resources/jsc/utils.js helper
// visible to the script that includes it.
function javascriptSourceFor(root, ctx) {
  const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const uris = [...asList(root.IncludeURL).map(String), ...asList(root.ResourceURL).map(String)];
  const byPath = new Map((ctx.resources || []).map((r) => [r.path, r.content]));

  const parts = [];
  const missing = [];
  for (const uri of uris) {
    const m = /^([a-z]+):\/\/(.+)$/.exec(uri.trim());
    if (!m) continue;
    const path = `resources/${m[1]}/${m[2]}`;
    const content = byPath.get(path);
    if (content == null) missing.push(path);
    else parts.push(`// ${path}\n${content}`);
  }
  return { source: parts.length ? parts.join('\n;\n') : null, missing };
}

function execJavascript(policy, root) {
  const timeLimit = Number(attr(root, 'timeLimit')) || 200;
  return (ctx) => {
    const { source, missing } = javascriptSourceFor(root, ctx);
    if (missing.length) {
      return [`error: JavaScript resource(s) not in this bundle: ${missing.join(', ')} — add them on the Resources tab`];
    }
    if (source == null) return ['JavaScript resource is empty or missing — nothing executed'];

    // Structured as "level: text" strings (not objects) so they still flow
    // through the plain notes[]/string[] shape the rest of the trace uses —
    // the client's Console view recognizes the level prefix and re-groups them.
    const logs = [];
    const log = (level, args) => logs.push(`${level}: ${args.map(String).join(' ')}`);
    const sandbox = {
      context: {
        getVariable: (name) => getVariable(ctx, name),
        setVariable: (name, value) => setVariable(ctx, name, value),
        removeVariable: (name) => {
          delete ctx.variables[name];
        },
      },
      request: messageShim(ctx.request),
      response: messageShim(ctx.response),
      print: (...args) => log('print', args),
      // Real Apigee/Rhino only has print(), but most people write JS against
      // console.* out of habit — support it too rather than fail confusingly.
      console: {
        log: (...args) => log('log', args),
        info: (...args) => log('log', args),
        warn: (...args) => log('warn', args),
        error: (...args) => log('error', args),
      },
    };

    try {
      new vm.Script(source, { filename: `${policy.name}.js` }).runInContext(vm.createContext(sandbox), { timeout: timeLimit });
    } catch (err) {
      // Attach whatever was logged before the crash — otherwise the output
      // leading up to a thrown error vanishes along with the failed step.
      throw new FaultError({ message: `JavaScript policy "${policy.name}" threw: ${err.message}`, status: 500, logs });
    }
    // Emulated via Node's vm, not Rhino — no Java interop/E4X, and timing is
    // wall-clock rather than Apigee's CPU-time accounting.
    return logs.length ? logs : undefined;
  };
}

// -------------------------------------------------------- KeyValueMapOperations
// Composite keys join each <Key><Parameter> in order with "!" — an internal
// convention for this mock store, not something Apigee exposes.
function kvmCompositeKey(keyNode, ctx, render) {
  return asArray(keyNode?.Parameter)
    .map((p) => {
      const ref = attr(p, 'ref');
      return ref ? String(getVariable(ctx, ref) ?? '') : render(textOf(p));
    })
    .join('!');
}

function execKeyValueMapOperations(policy, root) {
  const mapId = attr(root, 'mapIdentifier') || policy.name;
  const ignoreUnresolved = ignoreUnresolvedOf(root);
  return (ctx) => {
    const render = (s) => renderTemplate(s, ctx, { ignoreUnresolved, policyName: policy.name });

    if (root.Get) {
      const assignTo = attr(root.Get, 'assignTo');
      const key = kvmCompositeKey(root.Get.Key, ctx, render);
      const storeKey = `${mapId}::${key}`;
      if (!ctx.stores.kvm.has(storeKey)) {
        throw new FaultError({
          message: `KeyValueMapOperations "${policy.name}": key "${key}" not found in map "${mapId}" (seed test.initialState.kvm to simulate an existing entry)`,
          status: 500,
        });
      }
      if (assignTo) setVariable(ctx, assignTo, ctx.stores.kvm.get(storeKey));
    }
    if (root.Put) {
      const key = kvmCompositeKey(root.Put.Key, ctx, render);
      const ref = attr(root.Put.Value, 'ref');
      const value = ref ? String(getVariable(ctx, ref) ?? '') : render(textOf(root.Put.Value));
      ctx.stores.kvm.set(`${mapId}::${key}`, value);
    }
    if (root.Delete) {
      ctx.stores.kvm.delete(`${mapId}::${kvmCompositeKey(root.Delete.Key, ctx, render)}`);
    }
  };
}

// ----------------------------------------------------------------------- Cache
// PopulateCache/LookupCache/InvalidateCache all key into the same mock store
// by CacheResource + composed <CacheKey><KeyFragment> — TTL/expiry is not
// simulated, an entry just lives for the rest of the run once populated.
function cacheKeyOf(root, ctx, render) {
  const resource = root.CacheResource !== undefined ? textOf(root.CacheResource) : 'default';
  const parts = asArray(root.CacheKey?.KeyFragment).map((kf) => {
    const ref = attr(kf, 'ref');
    return ref ? String(getVariable(ctx, ref) ?? '') : render(textOf(kf));
  });
  return `${resource}::${parts.join('!')}`;
}

function execPopulateCache(policy, root) {
  const ignoreUnresolved = ignoreUnresolvedOf(root);
  return (ctx) => {
    const render = (s) => renderTemplate(s, ctx, { ignoreUnresolved, policyName: policy.name });
    const sourceVar = root.Source !== undefined ? textOf(root.Source) : 'message.content';
    ctx.stores.cache.set(cacheKeyOf(root, ctx, render), getVariable(ctx, sourceVar) ?? '');
    return ['Cache TTL/expiry not simulated — the entry persists for the rest of this run'];
  };
}

function execLookupCache(policy, root) {
  const ignoreUnresolved = ignoreUnresolvedOf(root);
  return (ctx) => {
    const render = (s) => renderTemplate(s, ctx, { ignoreUnresolved, policyName: policy.name });
    const key = cacheKeyOf(root, ctx, render);
    const hit = ctx.stores.cache.has(key);
    setVariable(ctx, `lookupcache.${policy.name}.cachehit`, hit ? 'true' : 'false');
    const assignTo = root.AssignTo !== undefined ? textOf(root.AssignTo) : undefined;
    if (hit && assignTo) setVariable(ctx, assignTo, ctx.stores.cache.get(key));
  };
}

function execInvalidateCache(policy, root) {
  const ignoreUnresolved = ignoreUnresolvedOf(root);
  return (ctx) => {
    const render = (s) => renderTemplate(s, ctx, { ignoreUnresolved, policyName: policy.name });
    ctx.stores.cache.delete(cacheKeyOf(root, ctx, render));
  };
}

// ----------------------------------------------------------------------- Quota
// A single test run represents one request, so a fresh counter can never
// exceed its own limit on the first call — seed test.initialState.quota with
// `"<PolicyName>::<identifier>": <count>` to simulate "this is request N in
// the window." The calendar/rolling window itself is not simulated: the
// counter just increments once per execution within a run.
function execQuota(policy, root) {
  const allow = Number(attr(root.Allow, 'count')) || Number(textOf(root.Allow)) || 0;
  const identifierRef = attr(root.Identifier, 'ref');
  return (ctx) => {
    const identifier = identifierRef ? String(getVariable(ctx, identifierRef) ?? '') : '';
    const storeKey = `${policy.name}::${identifier}`;
    const used = (ctx.stores.quota.get(storeKey) || 0) + 1;
    ctx.stores.quota.set(storeKey, used);

    setVariable(ctx, `ratelimit.${policy.name}.allowed.count`, String(allow));
    setVariable(ctx, `ratelimit.${policy.name}.used.count`, String(used));
    setVariable(ctx, `ratelimit.${policy.name}.available.count`, String(Math.max(allow - used, 0)));

    const notes = ['Quota interval/calendar reset not simulated — count only increments within this run'];
    if (used > allow) throw new FaultError({ message: `Quota "${policy.name}" exceeded (${used}/${allow})`, status: 429 });
    return notes;
  };
}

// ------------------------------------------------------------------ SpikeArrest
// Real spike arrest smooths traffic over wall-clock time, which a single
// synthetic request has none of — this only counts calls-within-the-run
// against the parsed rate, so it mainly verifies the policy is wired in.
// Seed test.initialState.spikeArrest to simulate an in-progress burst.
function parseRate(rateStr) {
  const m = /^(\d+)\s*p(s|m)$/i.exec(String(rateStr || '').trim());
  if (!m) return null;
  return { limit: Number(m[1]), unit: m[2].toLowerCase() === 's' ? 'second' : 'minute' };
}

function execSpikeArrest(policy, root) {
  const identifierRef = attr(root.Identifier, 'ref');
  const rate = parseRate(textOf(root.Rate));
  return (ctx) => {
    const identifier = identifierRef ? String(getVariable(ctx, identifierRef) ?? '') : '';
    const storeKey = `${policy.name}::${identifier}`;
    const used = (ctx.stores.spikeArrest.get(storeKey) || 0) + 1;
    ctx.stores.spikeArrest.set(storeKey, used);

    const notes = ['Rate smoothing across real elapsed time is not simulated — this only counts calls within the run'];
    if (rate && used > rate.limit) {
      throw new FaultError({ message: `SpikeArrest "${policy.name}" rejected the request (rate exceeded)`, status: 429 });
    }
    return notes;
  };
}

// ------------------------------------------------------------------- XMLToJSON
// Best-effort emulation, parsed with fast-xml-parser and reshaped per the
// policy's <Options>. When <NamespaceBlockName> is set (as it is whenever a
// proxy actually cares about clean keys), this mirrors Apigee's real
// behavior of stripping the namespace prefix off element/attribute names and
// filing the xmlns declarations under that block instead — not just cosmetic:
// a lot of hand-written cleanup JS after this policy matches bare element
// names (`body.Fault`, `envelope.Body`), which only ever line up once
// prefixes are actually stripped. Without NamespaceBlockName, prefixes are
// left as literally authored, matching Apigee's own default. Either way this
// doesn't resolve namespace URIs or detect real prefix collisions beyond a
// simple same-level rename — good enough to exercise downstream JSON-shaped
// logic, not a byte-for-byte match of real Apigee output.
function execXMLToJSON(policy, root) {
  const sourceName = root.Source !== undefined ? textOf(root.Source) : 'response';
  const outputName = root.OutputVariable !== undefined ? textOf(root.OutputVariable) : sourceName;
  const opts = root.Options || {};
  const boolOpt = (node, def) => (node === undefined ? def : String(textOf(node)).toLowerCase() === 'true');
  const recognizeNumber = boolOpt(opts.RecognizeNumber, false);
  const recognizeBoolean = boolOpt(opts.RecognizeBoolean, false);
  const recognizeNull = boolOpt(opts.RecognizeNull, false);
  const nullValue = opts.NullValue !== undefined ? textOf(opts.NullValue) : 'null';
  const textNodeName = opts.TextNodeName !== undefined ? textOf(opts.TextNodeName) : '#text';
  const attrBlockName = opts.AttributeBlockName !== undefined ? textOf(opts.AttributeBlockName) : undefined;
  const attrPrefix = opts.AttributePrefix !== undefined ? textOf(opts.AttributePrefix) : '';
  const invalidCharsReplacement = opts.InvalidCharsReplacement !== undefined ? textOf(opts.InvalidCharsReplacement) : '_';
  const namespaceMode = opts.NamespaceBlockName !== undefined;
  const namespaceBlockName = namespaceMode ? textOf(opts.NamespaceBlockName) : undefined;
  const defaultNsNodeName = opts.DefaultNamespaceNodeName !== undefined ? textOf(opts.DefaultNamespaceNodeName) : '#default';
  const nsSeparator = opts.NamespaceSeparator !== undefined ? textOf(opts.NamespaceSeparator) : ':';

  const sanitizeName = (name) => name.replace(/[^\w:.-]/g, invalidCharsReplacement);
  const splitPrefix = (name) => {
    const idx = name.indexOf(':');
    return idx === -1 ? { prefix: null, local: name } : { prefix: name.slice(0, idx), local: name.slice(idx + 1) };
  };

  function convertLeaf(value) {
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (recognizeNull && value === nullValue) return null;
    return value;
  }

  function convert(node) {
    if (Array.isArray(node)) return node.map(convert);
    if (!node || typeof node !== 'object') return convertLeaf(node);

    const nsEntries = {};
    const attrs = {};
    const children = [];
    let text;
    let hasText = false;

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@_')) {
        const attrName = key.slice(2);
        if (namespaceMode && (attrName === 'xmlns' || attrName.startsWith('xmlns:'))) {
          const nsKey = attrName === 'xmlns' ? defaultNsNodeName : attrName.slice('xmlns:'.length);
          nsEntries[nsKey] = value;
          continue;
        }
        const local = namespaceMode ? splitPrefix(attrName).local : attrName;
        attrs[sanitizeName(`${attrPrefix}${local}`)] = convertLeaf(value);
        continue;
      }
      if (key === '#text') {
        text = value;
        hasText = true;
        continue;
      }
      children.push({ key, value });
    }

    // Same-level local-name collisions (two children with the same local
    // name but different prefixes) fall back to `prefix<separator>local`
    // instead of the bare local name, so they don't clobber each other.
    const counts = {};
    children.forEach(({ key }) => {
      const local = namespaceMode ? splitPrefix(key).local : key;
      counts[local] = (counts[local] || 0) + 1;
    });

    const out = {};
    children.forEach(({ key, value }) => {
      const { prefix, local } = namespaceMode ? splitPrefix(key) : { prefix: null, local: key };
      const outKey = sanitizeName(counts[local] === 1 ? local : prefix ? `${prefix}${nsSeparator}${local}` : local);
      out[outKey] = convert(value);
    });
    if (hasText) out[textNodeName] = convertLeaf(text);
    if (Object.keys(nsEntries).length) out[namespaceBlockName] = nsEntries;
    if (Object.keys(attrs).length) {
      if (attrBlockName) out[attrBlockName] = attrs;
      else Object.assign(out, attrs);
    }
    return out;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: recognizeNumber || recognizeBoolean,
    trimValues: true,
  });

  return (ctx) => {
    const msg = sourceName === 'request' ? ctx.request : sourceName === 'response' ? ctx.response : undefined;
    const xml = msg ? msg.content : getVariable(ctx, sourceName);
    if (!xml) return [`XMLToJSON "${policy.name}": source "${sourceName}" is empty — nothing to convert`];

    let parsed;
    try {
      parsed = parser.parse(xml);
    } catch (err) {
      throw new FaultError({ message: `XMLToJSON "${policy.name}" failed to parse XML: ${err.message}`, status: 500 });
    }

    const json = JSON.stringify(convert(parsed));
    if (outputName === 'request' || outputName === 'response') {
      const target = outputName === 'request' ? ctx.request : ctx.response;
      if (target) target.content = json;
    } else {
      setVariable(ctx, outputName, json);
    }
    return ['Best-effort emulation — namespace resolution and attribute bucketing are approximate, not a byte-for-byte match of real Apigee output'];
  };
}

// registry maps root XML tag -> (policy, root) => (ctx) => notes[] | void
// AssignMessage/RaiseFault/ExtractVariables/Javascript all follow this
// "compile once, run against ctx" shape except AssignMessage, which has no
// per-run closure state to build and just runs directly.
const HANDLERS = {
  AssignMessage: (policy, root) => (ctx) => execAssignMessage(policy, root, ctx),
  RaiseFault: execRaiseFault,
  ExtractVariables: execExtractVariables,
  Javascript: execJavascript,
  KeyValueMapOperations: execKeyValueMapOperations,
  PopulateCache: execPopulateCache,
  LookupCache: execLookupCache,
  InvalidateCache: execInvalidateCache,
  Quota: execQuota,
  SpikeArrest: execSpikeArrest,
  XMLToJSON: execXMLToJSON,
};

// Runs `policy` against `ctx`. Returns:
//   { emulated: true, policyTag, skipped?: true, notes?: string[] }
//   { emulated: false, policyTag }  — no handler for this XML tag
export function executePolicy(policy, ctx) {
  const parsed = parsePolicyXml(policy);
  const tag = rootTagOf(parsed);
  const root = parsed[tag] || {};

  const enabled = attr(root, 'enabled');
  if (enabled !== undefined && String(enabled).toLowerCase() === 'false') {
    return { emulated: true, skipped: true, policyTag: tag };
  }

  const compile = HANDLERS[tag];
  if (!compile) return { emulated: false, policyTag: tag };

  const run = compile(policy, root);
  const notes = run(ctx);
  return { emulated: true, policyTag: tag, notes: notes && notes.length ? notes : undefined };
}
