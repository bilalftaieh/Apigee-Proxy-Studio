import { nanoid } from 'nanoid';
import { normalizeProxy } from './model.js';
import { parser, text, asArray, parseSteps, extractRootTagName, collectBundleResources, readZip } from './xmlImportUtils.js';

// A bare `{variableName}` maps to our "variable" VarValue mode; anything
// else (including a literal URL) is "literal" — the exact inverse of
// bundleGenerator's renderVarValue().
function parseVarValue(raw) {
  const trimmed = text(raw).trim();
  const m = trimmed.match(/^\{(.+)\}$/);
  return m ? { mode: 'variable', value: m[1] } : { mode: 'literal', value: trimmed };
}

function parseFlowBlock(node) {
  if (!node || typeof node !== 'object') return { request: [], response: [] };
  return {
    request: parseSteps(node.Request?.Step),
    response: parseSteps(node.Response?.Step),
  };
}

// Conditional flows are always imported in "custom" condition mode — we
// don't attempt to reverse-engineer an arbitrary condition string back into
// the Path/Verb builder's structured fields.
function parseFlows(flowNode) {
  return asArray(flowNode)
    .filter((f) => f && typeof f === 'object')
    .map((f) => ({
      id: nanoid(10),
      name: f['@_name'] || 'Flow',
      description: f.Description ? text(f.Description) : '',
      condition: f.Condition ? text(f.Condition) : '',
      conditionMode: 'custom',
      pathValue: '',
      pathOperator: 'MatchesPath',
      verb: 'ANY',
      request: parseSteps(f.Request?.Step),
      response: parseSteps(f.Response?.Step),
    }));
}

// A RouteRule is a URL route if it carries <URL>, a target route if it carries
// <TargetEndpoint>, and a null route if it carries neither — that last case is
// meaningful, not malformed, so it's preserved rather than coerced to a target.
function parseRouteRules(node) {
  return asArray(node)
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const targetName = r.TargetEndpoint != null ? text(r.TargetEndpoint) : '';
      const url = r.URL != null ? text(r.URL) : '';
      const mode = url ? 'url' : targetName ? 'target' : 'null';
      return {
        id: nanoid(8),
        name: r['@_name'] || 'default',
        targetName,
        url,
        mode,
        condition: r.Condition ? text(r.Condition) : '',
      };
    });
}

function parseSslInfo(conn) {
  const ssl = conn.SSLInfo;
  if (!ssl || typeof ssl !== 'object') return undefined;
  return {
    enabled: ssl.Enabled != null ? text(ssl.Enabled) !== 'false' : true,
    clientAuthEnabled: ssl.ClientAuthEnabled != null ? text(ssl.ClientAuthEnabled) === 'true' : false,
    keyStore: ssl.KeyStore != null ? text(ssl.KeyStore) : '',
    keyAlias: ssl.KeyAlias != null ? text(ssl.KeyAlias) : '',
    trustStore: ssl.TrustStore != null ? text(ssl.TrustStore) : '',
    ignoreValidationErrors: ssl.IgnoreValidationErrors != null ? text(ssl.IgnoreValidationErrors) === 'true' : false,
  };
}

function parseAuthentication(conn) {
  const auth = conn.Authentication;
  if (!auth || typeof auth !== 'object') return undefined;
  const headerName = auth.HeaderName != null ? text(auth.HeaderName) : '';

  if (auth.GoogleAccessToken) {
    const scopes = asArray(auth.GoogleAccessToken.Scopes?.Scope).map(text).filter(Boolean);
    return { mode: 'googleAccessToken', scopes, headerName, useTargetUrl: false };
  }
  if (auth.GoogleIDToken) {
    const aud = auth.GoogleIDToken.Audience;
    const useTargetUrl = !!(aud && typeof aud === 'object' && aud['@_useTargetUrl'] === 'true');
    return {
      mode: 'googleIdToken',
      useTargetUrl,
      audience: useTargetUrl || aud == null ? { mode: 'literal', value: '' } : parseVarValue(aud),
      headerName,
      scopes: [],
    };
  }
  return undefined;
}

// EventFlow is response-only; a <Request> child would have been rejected by
// Apigee, so it is not read back even if a hand-edited bundle contains one.
function parseEventFlow(root) {
  const ef = root.EventFlow;
  if (!ef || typeof ef !== 'object') return undefined;
  const response = parseSteps(ef.Response?.Step);
  if (!response.length) return undefined;
  return { contentType: ef['@_content-type'] || 'text/event-stream', response };
}

// Fault handling comes back in the two pieces the generator writes: the
// conditional <FaultRules><FaultRule> list (model: faultRules.rules) and the
// unconditional <DefaultFaultRule> (model: faultRules.steps).
//
// A hand-written bundle sometimes carries a <FaultRule name="DefaultFaultRule">
// *inside* <FaultRules>, which Apigee refuses to deploy — it casts anything by
// that name to a DefaultFaultRuleBean and throws (see buildFaultRulesBlock in
// bundleGenerator.js). Reading that back as an ordinary conditional rule would
// regenerate the same undeployable bundle, so it's lifted into the
// DefaultFaultRule slot instead and reported as an import warning.
function parseFaultRules(root, warnings = [], where = 'This bundle') {
  const rules = [];
  let steps = parseSteps(root?.DefaultFaultRule?.Step);

  for (const r of asArray(root?.FaultRules?.FaultRule)) {
    if (!r || typeof r !== 'object') continue;
    const name = r['@_name'] || 'FaultRule';
    const ruleSteps = parseSteps(r.Step);

    if (name === 'DefaultFaultRule') {
      // A real <DefaultFaultRule> sibling, if present, is the authoritative
      // one — don't let the malformed nested copy overwrite it.
      if (!steps.length) steps = ruleSteps;
      warnings.push(
        `${where}: a <FaultRule name="DefaultFaultRule"> nested inside <FaultRules> cannot deploy to Apigee, so it was imported as the DefaultFaultRule instead.`
      );
      continue;
    }

    rules.push({
      id: nanoid(8),
      name,
      condition: r.Condition != null ? text(r.Condition) : '',
      steps: ruleSteps,
    });
  }

  return { rules, steps };
}

// A zip's directory listing order is not the manifest's declared order —
// AdmZip (and most real-world zip tools) return `policies/*.xml`/`targets/*.xml`
// entries alphabetized by filename, regardless of how they were written. The
// root descriptor's <Policies>/<TargetEndpoints> list is the actual source of
// truth for order, so re-sort the parsed items to match it; anything present
// on disk but missing from the manifest (shouldn't normally happen) keeps its
// discovered order and sorts after everything the manifest names.
function reorderByManifest(items, manifestNames, nameOf) {
  const rank = new Map(manifestNames.map((n, i) => [n, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ra = rank.has(nameOf(a.item)) ? rank.get(nameOf(a.item)) : manifestNames.length + a.i;
      const rb = rank.has(nameOf(b.item)) ? rank.get(nameOf(b.item)) : manifestNames.length + b.i;
      return ra - rb;
    })
    .map(({ item }) => item);
}

function parseProxyEndpoint(xml, entryName, warnings) {
  const root = parser.parse(xml)?.ProxyEndpoint;
  if (!root) throw new Error(`${entryName} is not a valid ProxyEndpoint XML file — its root element must be <ProxyEndpoint>.`);
  return {
    name: root['@_name'] || 'default',
    description: root.Description ? text(root.Description) : '',
    preFlow: parseFlowBlock(root.PreFlow),
    postFlow: parseFlowBlock(root.PostFlow),
    postClientFlow: { response: parseSteps(root.PostClientFlow?.Response?.Step) },
    flows: parseFlows(root.Flows?.Flow),
    routeRules: parseRouteRules(root.RouteRule),
    faultRules: parseFaultRules(root, warnings, entryName),
    basePath: root.HTTPProxyConnection?.BasePath ? text(root.HTTPProxyConnection.BasePath) : undefined,
  };
}

function parseTargetEndpoint(xml, fallbackName, entryName, warnings) {
  const root = parser.parse(xml)?.TargetEndpoint;
  if (!root) throw new Error(`${entryName} is not a valid TargetEndpoint XML file — its root element must be <TargetEndpoint>.`);
  const conn = root.HTTPTargetConnection || {};

  let mode = 'url';
  let url = { mode: 'literal', value: '' };
  let targetServers = [];
  if (conn.LoadBalancer) {
    mode = 'targetServer';
    targetServers = asArray(conn.LoadBalancer.Server)
      .map((s) => (s && typeof s === 'object' ? s['@_name'] : null))
      .filter(Boolean);
  } else if (conn.URL != null) {
    url = parseVarValue(conn.URL);
  }
  const path = conn.Path != null ? parseVarValue(conn.Path) : undefined;

  return {
    id: nanoid(8),
    name: root['@_name'] || fallbackName,
    description: root.Description ? text(root.Description) : '',
    mode,
    url,
    targetServers,
    path,
    preFlow: parseFlowBlock(root.PreFlow),
    postFlow: parseFlowBlock(root.PostFlow),
    flows: parseFlows(root.Flows?.Flow),
    faultRules: parseFaultRules(root, warnings, entryName),
    eventFlow: parseEventFlow(root),
    sslInfo: parseSslInfo(conn),
    authentication: parseAuthentication(conn),
  };
}

// Wraps a plain "relative path -> content" map (as produced by
// generateBundleFiles) in the same { entryName, getData() } shape a real zip
// entry has, so the parsing logic below is agnostic to where the bytes came
// from. This is what lets scripts/roundtrip.mjs import straight from a
// generator's output without building an in-memory zip first.
function filesToEntries(files) {
  const entries = Object.entries(files).map(([entryName, content]) => ({
    entryName,
    getData: () => Buffer.from(content, 'utf-8'),
  }));
  const entriesByPath = new Map(entries.map((e) => [e.entryName, e]));
  return { entries, entriesByPath };
}

// The zip entry path with the bundle prefix stripped, so an error names
// "targets/default.xml" rather than a long "myproxy_rev3/apiproxy/..." path the
// user never typed.
function relativeName(entry, prefix) {
  const p = entry.entryName.replace(/\\/g, '/');
  return p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

function importProxyFromEntries({ entries, entriesByPath }) {
  const proxiesEntry = entries.find((e) => /(^|\/)apiproxy\/proxies\/[^/]+\.xml$/.test(e.entryName.replace(/\\/g, '/')));
  if (!proxiesEntry) {
    throw new Error("This doesn't look like an Apigee proxy bundle — no apiproxy/proxies/*.xml found.");
  }
  const normalizedPath = proxiesEntry.entryName.replace(/\\/g, '/');
  const prefix = normalizedPath.slice(0, normalizedPath.indexOf('apiproxy/') + 'apiproxy/'.length);

  const withinBundle = (subPath) =>
    entries.filter((e) => {
      const p = e.entryName.replace(/\\/g, '/');
      return p.startsWith(prefix + subPath) && p.slice((prefix + subPath).length).length > 0;
    });

  const rootEntry = entries.find((e) => {
    const p = e.entryName.replace(/\\/g, '/');
    return p.startsWith(prefix) && /^[^/]+\.xml$/.test(p.slice(prefix.length));
  });
  if (!rootEntry) {
    throw new Error('Missing the root apiproxy/<name>.xml descriptor.');
  }

  const rootXml = rootEntry.getData().toString('utf-8');
  const rootObj = parser.parse(rootXml)?.APIProxy;
  if (!rootObj) throw new Error('Root apiproxy XML is not a valid <APIProxy> document.');

  const name = rootObj['@_name'] || rootEntry.entryName.replace(/^.*\//, '').replace(/\.xml$/, '');
  const description = rootObj.Description ? text(rootObj.Description) : '';

  // Policies — kept as their original raw XML verbatim; only the type (for
  // icon/label) and an optional resource file are inferred. Reordered to match
  // the root descriptor's <Policies> manifest, since the zip's own directory
  // listing order is not that (see reorderByManifest).
  const policyEntries = withinBundle('policies/').filter((e) => e.entryName.endsWith('.xml'));
  const policyManifestOrder = asArray(rootObj.Policies?.Policy).map(text).filter(Boolean);
  const unorderedPolicies = policyEntries.map((e) => {
    const policyName = e.entryName.replace(/\\/g, '/').split('/').pop().replace(/\.xml$/, '');
    const xml = e.getData().toString('utf-8');
    return {
      id: nanoid(10),
      name: policyName,
      type: extractRootTagName(xml),
      xml,
    };
  });
  const policies = reorderByManifest(unorderedPolicies, policyManifestOrder, (p) => p.name);

  // Proxy endpoint — Apigee X supports multiple, but this app models one;
  // pick the one the root descriptor lists first (falling back to whichever
  // proxies/*.xml file we found).
  const proxyEndpointNames = asArray(rootObj.ProxyEndpoints?.ProxyEndpoint).map(text).filter(Boolean);
  const proxyEndpointEntries = withinBundle('proxies/').filter((e) => e.entryName.endsWith('.xml'));
  const chosenPeEntry =
    proxyEndpointEntries.find((e) => e.entryName.replace(/\\/g, '/').endsWith(`/${proxyEndpointNames[0]}.xml`)) ||
    proxyEndpointEntries[0];
  // Collected by the endpoint parsers themselves (see parseFaultRules), so it
  // has to exist before they run rather than alongside the warnings assembled
  // further down.
  const parseWarnings = [];
  const peParsed = parseProxyEndpoint(
    chosenPeEntry.getData().toString('utf-8'),
    relativeName(chosenPeEntry, prefix),
    parseWarnings
  );
  const droppedProxyEndpoints = proxyEndpointEntries.length - 1;

  const targetEntries = withinBundle('targets/').filter((e) => e.entryName.endsWith('.xml'));
  const targetManifestOrder = asArray(rootObj.TargetEndpoints?.TargetEndpoint).map(text).filter(Boolean);
  const unorderedTargets = targetEntries.map((e) => {
    const fallbackName = e.entryName.replace(/\\/g, '/').split('/').pop().replace(/\.xml$/, '');
    return parseTargetEndpoint(e.getData().toString('utf-8'), fallbackName, relativeName(e, prefix), parseWarnings);
  });
  const targets = reorderByManifest(unorderedTargets, targetManifestOrder, (t) => t.name);

  const resources = collectBundleResources(entries, entriesByPath, prefix);

  const basePathWarnings = [];
  // The ProxyEndpoint's <HTTPProxyConnection><BasePath> is what Apigee
  // actually deploys and routes on. The root descriptor's <Basepaths> is a
  // legacy manifest element (see bundleGenerator's note) that real Apigee
  // exports leave stale, empty or absent — so it's only a fallback, never an
  // override. Reading it first silently rewrote an imported proxy's base path
  // and then re-exported the wrong one.
  const basePath = peParsed.basePath || text(rootObj.Basepaths) || '/imported';
  if (peParsed.basePath && rootObj.Basepaths != null) {
    const manifestBasePath = text(rootObj.Basepaths);
    if (manifestBasePath && manifestBasePath !== peParsed.basePath) {
      basePathWarnings.push(
        `The root descriptor's <Basepaths> ("${manifestBasePath}") disagrees with the ProxyEndpoint's <BasePath> ("${peParsed.basePath}"); the ProxyEndpoint value was used, since that's what Apigee routes on.`
      );
    }
  }

  const proxy = {
    id: nanoid(10),
    name,
    basePath,
    description,
    proxyEndpointName: peParsed.name,
    policies,
    resources,
    targets: targets.length
      ? targets
      : [
          {
            id: nanoid(8),
            name: 'default',
            description: '',
            mode: 'url',
            url: { mode: 'literal', value: 'https://' },
            targetServers: [],
            preFlow: { request: [], response: [] },
            postFlow: { request: [], response: [] },
            flows: [],
            faultRules: { steps: [] },
          },
        ],
    preFlow: peParsed.preFlow,
    postFlow: peParsed.postFlow,
    postClientFlow: peParsed.postClientFlow,
    flows: peParsed.flows,
    routeRules: peParsed.routeRules.length
      ? peParsed.routeRules
      : [{ id: nanoid(8), name: 'default', targetName: targets[0]?.name || 'default', condition: '', mode: 'target' }],
    faultRules: peParsed.faultRules,
    lintExcludes: [],
    environments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const warnings = [...parseWarnings, ...basePathWarnings];
  if (droppedProxyEndpoints > 0) {
    warnings.push(`This bundle has ${droppedProxyEndpoints + 1} ProxyEndpoints; only "${peParsed.name}" was imported.`);
  }

  return { proxy: normalizeProxy(proxy), warnings };
}

export function importProxyZip(buffer) {
  return importProxyFromEntries(readZip(buffer));
}

export function importProxyFromFiles(files) {
  return importProxyFromEntries(filesToEntries(files));
}
