import { escapeXml, escapeXmlText, XML_HEADER } from './xml.js';

// `files` is a flat "relative path -> content" map that downstream code
// (lint.js, routes/bundle.js, routes/sharedFlowBundle.js) turns into real
// filesystem paths or zip entries. Every path segment sourced from saved
// proxy/policy/shared-flow data is checked before it's used to build a key,
// so a "/", "\", or ".." can't make that content land outside the bundle.
export function assertSafeSegment(value, label) {
  if (typeof value !== 'string' || !value || /[\\/]/.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

export function assertSafeRelPath(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some((seg) => seg === '..')) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

// Writes each policy's XML into `files`. Resource files are NOT written here:
// they all live in the proxy/shared-flow level `resources` collection (see
// foldPolicyResources in model.js) and are written by addBundleResources.
export function addPolicyFiles(files, root, policies = []) {
  for (const policy of policies) {
    assertSafeSegment(policy.name, 'policy name');
    files[`${root}/policies/${policy.name}.xml`] = policy.xml;
  }
}

// Every resource file in the bundle. Policies reference these by URI from
// their own XML (jsc://utils.js, oas://spec.yaml, ...); nothing here is owned
// by a policy — see foldPolicyResources in model.js.
export function addBundleResources(files, root, resources = []) {
  for (const resource of resources) {
    assertSafeRelPath(resource.path, 'resource path');
    files[`${root}/${resource.path}`] = resource.content;
  }
}

function buildStepsXml(steps = [], indent = '            ') {
  if (!steps.length) return '';
  return steps
    .map((step) => {
      const cond = step.condition
        ? `\n${indent}    <Condition>${escapeXmlText(step.condition)}</Condition>`
        : '';
      return `${indent}<Step>\n${indent}    <Name>${escapeXmlText(step.policyName)}</Name>${cond}\n${indent}</Step>`;
    })
    .join('\n');
}

function renderVarValue(varValue) {
  if (!varValue || !varValue.value) return '';
  return varValue.mode === 'variable' ? `{${varValue.value}}` : varValue.value;
}

function buildFlowBlock(tag, flow, indent = '    ') {
  const req = buildStepsXml(flow?.request, indent + '        ');
  const res = buildStepsXml(flow?.response, indent + '        ');
  return `${indent}<${tag} name="${tag}">\n${indent}    <Request>${req ? `\n${req}\n${indent}    ` : ''}</Request>\n${indent}    <Response>${res ? `\n${res}\n${indent}    ` : ''}</Response>\n${indent}</${tag}>`;
}

// Conditional <Flow> blocks — shared by ProxyEndpoint and TargetEndpoint. A
// flow toggled off (Flow.enabled === false) is a "soft delete" — kept in the
// saved proxy for later, but left out of the bundle entirely, exactly as if
// it had been removed.
function buildFlowsBlock(flows = []) {
  const active = flows.filter((f) => f.enabled !== false);
  if (!active.length) return '    <Flows/>';
  const body = active
    .map((flow) => {
      const req = buildStepsXml(flow.request, '            ');
      const res = buildStepsXml(flow.response, '            ');
      const cond = flow.condition
        ? `\n        <Condition>${escapeXmlText(flow.condition)}</Condition>`
        : '';
      const desc = flow.description
        ? `\n            <Description>${escapeXmlText(flow.description)}</Description>`
        : '';
      return `        <Flow name="${escapeXml(flow.name)}">${desc}\n            <Request>${req ? `\n${req}\n            ` : ''}</Request>\n            <Response>${res ? `\n${res}\n            ` : ''}</Response>${cond}\n        </Flow>`;
    })
    .join('\n');
  return `    <Flows>\n${body}\n    </Flows>`;
}

// One conditional <FaultRule>. <Step>s come before <Condition> — both Apigee's
// schema order and how buildFlowsBlock emits a <Flow>. A rule with no steps is
// still emitted rather than dropped: it's valid XML, and silently discarding a
// half-built rule would lose work that's plainly visible in the editor.
function buildFaultRuleXml(rule) {
  const steps = buildStepsXml(rule.steps, '            ');
  const cond = rule.condition
    ? `            <Condition>${escapeXmlText(rule.condition)}</Condition>\n`
    : '';
  return `        <FaultRule name="${escapeXml(rule.name)}">\n${steps ? `${steps}\n` : ''}${cond}        </FaultRule>`;
}

// Fault handling for a ProxyEndpoint or TargetEndpoint: the conditional
// <FaultRules> list first, then the unconditional <DefaultFaultRule> — the
// order Apigee evaluates them in, and the order it wants them declared.
//
// The default must NOT be a <FaultRule name="DefaultFaultRule"> nested inside
// <FaultRules>: Apigee's runtime treats anything named "DefaultFaultRule" as
// a DefaultFaultRuleBean and casts it as such, so wrapping it in a plain
// <FaultRule> (a FaultRuleBean) throws a ClassCastException at deploy time.
// That is why the two are separate model fields rather than one ordered list.
//
// Each half is omitted when empty, so a proxy with no conditional rules still
// generates byte-identical XML to what it did before they were supported.
function buildFaultRulesBlock(faultRules) {
  const rules = faultRules?.rules || [];
  const conditional = rules.length
    ? `    <FaultRules>\n${rules.map(buildFaultRuleXml).join('\n')}\n    </FaultRules>\n`
    : '';
  const fallback = faultRules?.steps?.length
    ? `    <DefaultFaultRule name="DefaultFaultRule">\n${buildStepsXml(faultRules.steps, '        ')}\n    </DefaultFaultRule>\n`
    : '';
  return conditional + fallback;
}

// <Resources> lists each resource as "<type>://<basename>", the same URI form
// policies use in <ResourceURL>/<IncludeURL>. The type is the
// resources/<type>/ folder name. Built from the *final* file map (see
// generateBundleFiles) rather than from proxy.resources directly, so it can
// never drift from what's actually in the bundle.
function buildResourcesBlock(resourcePaths = []) {
  if (!resourcePaths.length) return '    <Resources/>';
  const refs = resourcePaths
    .map((p) => {
      const [, type, ...rest] = p.split('/'); // resources/jsc/utils.js
      return `        <Resource>${escapeXmlText(`${type}://${rest.join('/')}`)}</Resource>`;
    })
    .join('\n');
  return `    <Resources>\n${refs}\n    </Resources>`;
}

export function buildRootProxyXml(proxy, resourcePaths = []) {
  const policyRefs = (proxy.policies || [])
    .map((p) => `        <Policy>${escapeXmlText(p.name)}</Policy>`)
    .join('\n');
  const targetRefs = (proxy.targets || [])
    .map((t) => `        <TargetEndpoint>${escapeXmlText(t.name)}</TargetEndpoint>`)
    .join('\n');

  // <Basepaths> is a legacy manifest element: it isn't in the current API proxy
  // configuration reference, but Apigee's own bundle exports still emit it and
  // bundleImporter.js reads it as a basePath fallback, so it's kept for
  // round-trip fidelity. The authoritative base path is the ProxyEndpoint's
  // <HTTPProxyConnection><BasePath>. ConfigurationVersion 4.0 is still the only
  // supported value.
  return `${XML_HEADER}<APIProxy revision="1" name="${escapeXml(proxy.name)}">
    <Basepaths>${escapeXmlText(proxy.basePath)}</Basepaths>
    <ConfigurationVersion majorVersion="4" minorVersion="0"/>
    <Description>${escapeXmlText(proxy.description || '')}</Description>
    <DisplayName>${escapeXmlText(proxy.displayName || proxy.name)}</DisplayName>
    <Policies>
${policyRefs}
    </Policies>
    <ProxyEndpoints>
        <ProxyEndpoint>${escapeXmlText(proxy.proxyEndpointName || 'default')}</ProxyEndpoint>
    </ProxyEndpoints>
${buildResourcesBlock(resourcePaths)}
    <TargetServers/>
    <TargetEndpoints>
${targetRefs}
    </TargetEndpoints>
</APIProxy>`;
}

// PostClientFlow runs after the response has already been returned to the
// client. Apigee only permits MessageLogging steps here, and the flow has NO
// request side — emitting <Request> trips apigeelint PD006 ("Request is not
// supported here"), so only <Response> is rendered. Omitted entirely when empty
// rather than emitted as a stub.
function buildPostClientFlowBlock(postClientFlow) {
  const steps = buildStepsXml(postClientFlow?.response, '            ');
  if (!steps) return '';
  return `    <PostClientFlow name="PostClientFlow">
        <Response>
${steps}
        </Response>
    </PostClientFlow>\n`;
}

// A RouteRule has three shapes: a named TargetEndpoint, a direct URL, or a
// "null route" with no destination at all — the last one is how you tell Apigee
// the ProxyEndpoint already produced the response (a cache hit, say).
function buildRouteRuleXml(rr) {
  const cond = rr.condition ? `\n        <Condition>${escapeXmlText(rr.condition)}</Condition>` : '';
  const mode = rr.mode || 'target';

  if (mode === 'null') {
    // Self-closing with no children when unconditional; a bare condition
    // otherwise. Emitting an empty <TargetEndpoint/> here would NOT be a null
    // route — Apigee would try to resolve a target named "".
    return cond
      ? `    <RouteRule name="${escapeXml(rr.name)}">${cond}\n    </RouteRule>`
      : `    <RouteRule name="${escapeXml(rr.name)}"/>`;
  }

  const destination =
    mode === 'url'
      ? `\n        <URL>${escapeXmlText(rr.url || '')}</URL>`
      : `\n        <TargetEndpoint>${escapeXmlText(rr.targetName)}</TargetEndpoint>`;
  return `    <RouteRule name="${escapeXml(rr.name)}">${destination}${cond}\n    </RouteRule>`;
}

export function buildProxyEndpointXml(proxy) {
  const name = proxy.proxyEndpointName || 'default';
  const preFlow = buildFlowBlock('PreFlow', proxy.preFlow, '    ');
  const postFlow = buildFlowBlock('PostFlow', proxy.postFlow, '    ');
  const postClientFlow = buildPostClientFlowBlock(proxy.postClientFlow);
  const flowsBlock = buildFlowsBlock(proxy.flows);
  const faultHandling = buildFaultRulesBlock(proxy.faultRules);

  const routeRules = (proxy.routeRules || []).map(buildRouteRuleXml).join('\n');

  return `${XML_HEADER}<ProxyEndpoint name="${escapeXml(name)}">
    <Description>${escapeXmlText(proxy.description || '')}</Description>
${preFlow}
${postFlow}
${postClientFlow}${flowsBlock}
${faultHandling}    <HTTPProxyConnection>
        <BasePath>${escapeXmlText(proxy.basePath)}</BasePath>
        <Properties/>
    </HTTPProxyConnection>
${routeRules}
</ProxyEndpoint>`;
}

// Streaming (SSE) response pipeline. Two quirks: `content-type` is hyphenated,
// unlike every other Apigee attribute (it mirrors the HTTP header name), and
// EventFlow is response-only — a <Request> child is rejected outright
// (apigeelint EP002, "Misplaced Request element child of EventFlow").
function buildEventFlowBlock(eventFlow) {
  const steps = buildStepsXml(eventFlow?.response, '            ');
  if (!steps) return '';
  const contentType = eventFlow.contentType || 'text/event-stream';
  return `    <EventFlow content-type="${escapeXml(contentType)}">
        <Response>
${steps}
        </Response>
    </EventFlow>\n`;
}

// TD012: an https target wants exactly one <SSLInfo>, and a plain-http target
// must not have one at all — so this is skipped for http URLs even when the
// user configured TLS settings, since they'd be meaningless there anyway.
function buildSslInfoBlock(target) {
  const ssl = target.sslInfo;
  if (!ssl?.enabled) return '';
  if (target.mode !== 'targetServer') {
    const url = renderVarValue(target.url) || '';
    // A {variable} URL is resolved at runtime and could be either scheme; emit
    // SSLInfo for it, since https is the norm and TLS config is inert otherwise.
    if (/^http:\/\//i.test(url)) return '';
  }
  // <Enforce>true</Enforce> is required on the apigeex profile (apigeelint
  // TD004) — without it TLS is configured but not actually enforced. It must
  // NOT appear on the classic `apigee` profile, nor alongside an http URL,
  // which is already excluded above.
  const lines = ['            <Enabled>true</Enabled>', '            <Enforce>true</Enforce>'];
  if (ssl.clientAuthEnabled) {
    lines.push('            <ClientAuthEnabled>true</ClientAuthEnabled>');
    if (ssl.keyStore) lines.push(`            <KeyStore>${escapeXmlText(ssl.keyStore)}</KeyStore>`);
    if (ssl.keyAlias) lines.push(`            <KeyAlias>${escapeXmlText(ssl.keyAlias)}</KeyAlias>`);
  }
  if (ssl.trustStore) lines.push(`            <TrustStore>${escapeXmlText(ssl.trustStore)}</TrustStore>`);
  if (ssl.ignoreValidationErrors) {
    lines.push('            <IgnoreValidationErrors>true</IgnoreValidationErrors>');
  }
  return `        <SSLInfo>\n${lines.join('\n')}\n        </SSLInfo>\n`;
}

// Google-minted credential for the outbound call — lets a proxy reach an
// IAM-protected GCP backend without holding a secret.
function buildAuthenticationBlock(authentication) {
  const auth = authentication;
  if (!auth || auth.mode === 'none') return '';
  const header = auth.headerName ? `            <HeaderName>${escapeXmlText(auth.headerName)}</HeaderName>\n` : '';

  if (auth.mode === 'googleAccessToken') {
    const scopes = (auth.scopes?.length ? auth.scopes : ['https://www.googleapis.com/auth/cloud-platform'])
      .map((s) => `                    <Scope>${escapeXmlText(s)}</Scope>`)
      .join('\n');
    return `        <Authentication>
${header}            <GoogleAccessToken>
                <Scopes>
${scopes}
                </Scopes>
            </GoogleAccessToken>
        </Authentication>\n`;
  }

  // googleIdToken — useTargetUrl derives the audience from the resolved target
  // URL, which is the usual choice for Cloud Run and Cloud Functions.
  const audience = auth.useTargetUrl
    ? '                <Audience useTargetUrl="true"/>'
    : `                <Audience>${escapeXmlText(renderVarValue(auth.audience) || '')}</Audience>`;
  return `        <Authentication>
${header}            <GoogleIDToken>
${audience}
            </GoogleIDToken>
        </Authentication>\n`;
}

export function buildTargetEndpointXml(target) {
  const preFlow = buildFlowBlock('PreFlow', target.preFlow, '    ');
  const postFlow = buildFlowBlock('PostFlow', target.postFlow, '    ');
  const flowsBlock = buildFlowsBlock(target.flows);
  const eventFlow = buildEventFlowBlock(target.eventFlow);
  const faultHandling = buildFaultRulesBlock(target.faultRules);

  const connectionBody =
    target.mode === 'targetServer'
      ? `        <LoadBalancer>
${(target.targetServers?.length ? target.targetServers : ['target-server-name'])
  .map((s) => `            <Server name="${escapeXml(s)}"/>`)
  .join('\n')}
        </LoadBalancer>`
      : `        <URL>${escapeXmlText(renderVarValue(target.url) || 'https://')}</URL>`;

  const pathLine = target.path?.value ? `\n        <Path>${escapeXmlText(renderVarValue(target.path))}</Path>` : '';

  return `${XML_HEADER}<TargetEndpoint name="${escapeXml(target.name)}">
    <Description>${escapeXmlText(target.description || '')}</Description>
${preFlow}
${postFlow}
${flowsBlock}
${eventFlow}${faultHandling}    <HTTPTargetConnection>
        <Properties/>
${buildAuthenticationBlock(target.authentication)}${buildSslInfoBlock(target)}${connectionBody}${pathLine}
    </HTTPTargetConnection>
</TargetEndpoint>`;
}

// Returns a flat map of { "apiproxy/relative/path": "file contents" }
// mirroring exactly what a `.zip` import into Apigee X expects.
export function generateBundleFiles(proxy) {
  const files = {};
  const root = `apiproxy`;

  assertSafeSegment(proxy.name, 'proxy name');
  assertSafeSegment(proxy.proxyEndpointName || 'default', 'proxy endpoint name');

  files[`${root}/proxies/${proxy.proxyEndpointName || 'default'}.xml`] = buildProxyEndpointXml(proxy);

  for (const target of proxy.targets || []) {
    assertSafeSegment(target.name, 'target name');
    files[`${root}/targets/${target.name}.xml`] = buildTargetEndpointXml(target);
  }

  addBundleResources(files, root, proxy.resources);
  addPolicyFiles(files, root, proxy.policies);

  // Written last so the <Resources> manifest can be derived from the actual,
  // final file map — it can never drift from what's really in the bundle.
  const resourcesPrefix = `${root}/resources/`;
  const resourcePaths = Object.keys(files)
    .filter((p) => p.startsWith(resourcesPrefix))
    .map((p) => p.slice(root.length + 1))
    .sort();
  files[`${root}/${proxy.name}.xml`] = buildRootProxyXml(proxy, resourcePaths);

  return files;
}
