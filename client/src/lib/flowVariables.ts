/**
 * Apigee X flow variables, for completion and hover in policy XML.
 *
 * Two sources, and the second is the reason this file is worth having:
 *
 *   1. `APIGEE_FLOW_VARIABLES` — the built-in variables Apigee populates. A
 *      reference list, no better than the docs except that it's in the editor.
 *   2. `harvestProxyVariables` — the variables *this* proxy creates, read back
 *      out of its own policies. No documentation page can give you these, and
 *      they're the ones actually mistyped: a policy sets `oauth.claims.sub` and
 *      three policies downstream read `oauth.claim.sub`, which resolves to
 *      nothing and fails silently at runtime rather than at deploy time.
 */

export interface FlowVariableDef {
  name: string;
  doc: string;
  group: string;
  /**
   * Contains a `{…}` placeholder for something only the author knows (usually a
   * policy or header name), so completion inserts it as a snippet with the
   * placeholder selected rather than as literal text.
   */
  template?: boolean;
  /** Set on harvested variables — which policy creates this, for the hover. */
  setBy?: string;
}

/**
 * Built-in variables, deliberately trimmed to ones that come up while writing
 * policies. Apigee exposes hundreds more (per-transport, per-analytics); listing
 * them all would bury `request.verb` under noise.
 */
export const APIGEE_FLOW_VARIABLES: FlowVariableDef[] = [
  // ------------------------------------------------------------------ request
  { group: 'Request', name: 'request.verb', doc: 'HTTP method of the inbound request — `GET`, `POST`, …' },
  { group: 'Request', name: 'request.path', doc: 'Path of the inbound request *without* the query string, including the proxy base path.' },
  { group: 'Request', name: 'request.uri', doc: 'Full inbound request path **plus** query string.' },
  { group: 'Request', name: 'request.querystring', doc: 'Raw query string, without the leading `?`.' },
  { group: 'Request', name: 'request.content', doc: 'Request body as a string. Reading it buffers the payload.' },
  { group: 'Request', name: 'request.header.{name}', doc: 'One inbound request header. Header names are case-insensitive.', template: true },
  { group: 'Request', name: 'request.queryparam.{name}', doc: 'One inbound query parameter.', template: true },
  { group: 'Request', name: 'request.formparam.{name}', doc: 'One `application/x-www-form-urlencoded` body parameter.', template: true },
  { group: 'Request', name: 'request.headers.names', doc: 'Names of every inbound request header, as a list.' },
  { group: 'Request', name: 'request.queryparams.names', doc: 'Names of every inbound query parameter, as a list.' },

  // ----------------------------------------------------------------- response
  { group: 'Response', name: 'response.status.code', doc: 'HTTP status code returned by the target. Assigning to it changes what the client sees.' },
  { group: 'Response', name: 'response.reason.phrase', doc: 'HTTP reason phrase of the target response.' },
  { group: 'Response', name: 'response.content', doc: 'Response body as a string.' },
  { group: 'Response', name: 'response.header.{name}', doc: 'One response header.', template: true },

  // ------------------------------------------------------------------ message
  // `message` is whichever message the current flow is handling — request on the
  // request path, response on the response path. Using it keeps a policy usable
  // in both directions, which is what makes it worth listing separately.
  { group: 'Message (current)', name: 'message.verb', doc: 'Verb of the message the current flow is processing.' },
  { group: 'Message (current)', name: 'message.content', doc: 'Body of the message the current flow is processing — request on the request path, response on the response path.' },
  { group: 'Message (current)', name: 'message.status.code', doc: 'Status code of the current message (response path only).' },
  { group: 'Message (current)', name: 'message.header.{name}', doc: 'One header of the current message.', template: true },
  { group: 'Message (current)', name: 'message.queryparam.{name}', doc: 'One query parameter of the current message.', template: true },

  // -------------------------------------------------------------------- proxy
  { group: 'Proxy', name: 'proxy.name', doc: 'Name of the ProxyEndpoint handling this call.' },
  { group: 'Proxy', name: 'proxy.basepath', doc: 'The proxy base path, as configured — the literal prefix, not the requested path.' },
  { group: 'Proxy', name: 'proxy.pathsuffix', doc: 'Request path with the base path stripped off. What most conditional flows match on.' },
  { group: 'Proxy', name: 'proxy.url', doc: 'Full URL of the inbound request as the proxy received it.' },
  { group: 'Proxy', name: 'proxy.client.ip', doc: 'IP the request arrived from — the load balancer, unless `X-Forwarded-For` is resolved first.' },
  { group: 'Proxy', name: 'apiproxy.name', doc: 'Name of the API proxy.' },
  { group: 'Proxy', name: 'apiproxy.revision', doc: 'Revision number of the deployed bundle.' },
  { group: 'Proxy', name: 'current.flow.name', doc: 'Name of the flow currently executing — `PreFlow`, `PostFlow`, or your conditional flow\'s name.' },
  { group: 'Proxy', name: 'route.name', doc: 'Name of the RouteRule that matched, i.e. which target was chosen.' },

  // ------------------------------------------------------------------- target
  { group: 'Target', name: 'target.name', doc: 'Name of the TargetEndpoint handling this call.' },
  { group: 'Target', name: 'target.url', doc: 'Backend URL for this call. **Assigning to it overrides the configured target** — how dynamic routing is done.' },
  { group: 'Target', name: 'target.basepath', doc: 'Path configured on the TargetEndpoint (its `<Path>`), without the host.' },
  { group: 'Target', name: 'target.copy.pathsuffix', doc: 'Whether the proxy path suffix is appended to the target URL. Defaults to true.' },
  { group: 'Target', name: 'target.received.status.code', doc: 'Status code as received from the backend, before any policy rewrote it.' },

  // ---------------------------------------------------------------- env / org
  { group: 'Environment', name: 'environment.name', doc: 'Environment this revision is deployed to — `eval`, `prod`, …' },
  { group: 'Environment', name: 'organization.name', doc: 'Apigee organization name.' },

  // -------------------------------------------------------------------- fault
  { group: 'Fault', name: 'fault.name', doc: 'Name of the raised fault, e.g. `InvalidApiKey`. **The variable FaultRule conditions almost always test.**' },
  { group: 'Fault', name: 'fault.category', doc: 'Broad fault class — `Step`, `Transport`, or `Messaging`.' },
  { group: 'Fault', name: 'fault.subcategory', doc: 'Finer fault classification within the category.' },
  { group: 'Fault', name: 'is.error', doc: 'True once any policy has raised a fault. Guard for logging/cleanup steps.' },
  { group: 'Fault', name: 'error.status.code', doc: 'Status code of the error response being built.' },
  { group: 'Fault', name: 'error.reason.phrase', doc: 'Reason phrase of the error response.' },
  { group: 'Fault', name: 'error.message', doc: 'Error message text — often the most useful thing to log.' },
  { group: 'Fault', name: 'error.content', doc: 'Body of the error response.' },
  { group: 'Fault', name: 'error.transport.message', doc: 'Transport-level error text, set for connection/TLS failures where no HTTP response exists.' },

  // ----------------------------------------------------------------- identity
  { group: 'Identity', name: 'apiproduct.name', doc: 'API product matched by the key/token verification that ran earlier.' },
  { group: 'Identity', name: 'developer.email', doc: 'Email of the developer owning the app that called in.' },
  { group: 'Identity', name: 'developer.id', doc: 'Apigee developer id of the calling app\'s owner.' },
  { group: 'Identity', name: 'developer.app.name', doc: 'Name of the developer app that called in.' },
  { group: 'Identity', name: 'client_id', doc: 'Consumer key of the calling app, set by VerifyAPIKey or OAuthV2.' },

  // ------------------------------------------------------------------- system
  { group: 'System', name: 'system.timestamp', doc: 'Current time as a Unix epoch value in **milliseconds**.' },
  { group: 'System', name: 'system.time', doc: 'Current time as a formatted string.' },
  { group: 'System', name: 'system.uuid', doc: 'UUID of the message processor handling this call.' },
  { group: 'System', name: 'messageid', doc: 'Unique id for this request, the same value Apigee traces and analytics key on. **Log this.**' },
  { group: 'System', name: 'client.ip', doc: 'IP address of the immediate TCP peer.' },
  { group: 'System', name: 'client.received.start.timestamp', doc: 'When the request arrived, epoch ms. Subtract from `system.timestamp` for elapsed time.' },
];

/**
 * Variables written by policies that ran earlier, named after the policy that
 * wrote them. Listed here as templates because the policy name is the author's
 * to fill in — `harvestProxyVariables` resolves the same shapes concretely from
 * the policies a proxy actually has, which is strictly better when it applies.
 */
export const APIGEE_POLICY_OUTPUT_VARIABLES: FlowVariableDef[] = [
  { group: 'Policy output', name: 'verifyapikey.{policy}.client_id', doc: 'Consumer key accepted by that VerifyAPIKey policy.', template: true },
  { group: 'Policy output', name: 'verifyapikey.{policy}.apiproduct.name', doc: 'API product matched by that VerifyAPIKey policy.', template: true },
  { group: 'Policy output', name: 'oauthv2accesstoken.{policy}.access_token', doc: 'Token verified by that OAuthV2 policy.', template: true },
  { group: 'Policy output', name: 'jwt.{policy}.decoded.claim.{claim}', doc: 'One claim decoded by that VerifyJWT/DecodeJWT policy.', template: true },
  { group: 'Policy output', name: 'jwt.{policy}.valid', doc: 'Whether that VerifyJWT policy accepted the token.', template: true },
  { group: 'Policy output', name: 'ratelimit.{policy}.allowed.count', doc: 'Quota ceiling enforced by that Quota policy.', template: true },
  { group: 'Policy output', name: 'ratelimit.{policy}.used.count', doc: 'Quota consumed so far in the current window.', template: true },
  { group: 'Policy output', name: 'ratelimit.{policy}.exceed.count', doc: 'How far over the quota this caller has gone.', template: true },
  { group: 'Policy output', name: 'servicecallout.{policy}.expectedcn', doc: 'Expected TLS common name for that ServiceCallout.', template: true },
];

interface PolicyLike {
  name: string;
  xml: string;
}

function parse(xml: string): Document | null {
  if (!xml || !xml.trim()) return null;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.querySelector('parsererror') ? null : doc;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent || '').trim();
}

/** Pulls `{name}` capture groups out of an ExtractVariables `<Pattern>`. */
function patternCaptures(pattern: string): string[] {
  return [...pattern.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim()).filter(Boolean);
}

function add(into: Map<string, FlowVariableDef>, name: string, doc: string, setBy: string) {
  if (!name) return;
  const existing = into.get(name);
  if (existing) {
    // Two policies writing the same variable is worth saying out loud: whichever
    // runs last wins, and that ordering is a common source of "the value is
    // right in trace and wrong downstream".
    if (!existing.setBy?.includes(setBy)) existing.setBy = `${existing.setBy}, ${setBy}`;
    return;
  }
  into.set(name, { name, doc, group: 'This proxy', setBy });
}

/**
 * Reads the variables a set of policies creates. Best-effort by design: a
 * variable we fail to spot is simply absent from completion, which is where we
 * started, whereas guessing would put names into the list that resolve to
 * nothing at runtime.
 */
export function harvestProxyVariables(policies: PolicyLike[]): FlowVariableDef[] {
  const found = new Map<string, FlowVariableDef>();

  for (const policy of policies) {
    const doc = parse(policy.xml);
    const root = doc?.documentElement;
    if (!root) continue;
    const tag = root.tagName;
    const source = `${tag} "${policy.name}"`;

    if (tag === 'ExtractVariables') {
      const prefix = text(root.querySelector(':scope > VariablePrefix'));
      const qualify = (n: string) => (prefix ? `${prefix}.${n}` : n);
      // Explicit <Variable name="…"> under any payload/source section.
      for (const v of root.querySelectorAll('Variable[name]')) {
        add(found, qualify(v.getAttribute('name')!.trim()), 'Extracted by this policy.', source);
      }
      // Named captures inside <Pattern> — URIPath, QueryParam, Header, FormParam.
      for (const p of root.querySelectorAll('Pattern')) {
        const owner = p.parentElement?.tagName ?? 'Pattern';
        for (const capture of patternCaptures(text(p))) {
          add(found, qualify(capture), `Captured from the ${owner} pattern in this policy.`, source);
        }
      }
    }

    if (tag === 'AssignMessage' || tag === 'HTTPModifier') {
      for (const av of root.querySelectorAll('AssignVariable')) {
        add(found, text(av.querySelector(':scope > Name')), 'Assigned by this policy.', source);
      }
    }

    if (tag === 'KeyValueMapOperations') {
      for (const get of root.querySelectorAll('Get[assignTo]')) {
        add(found, get.getAttribute('assignTo')!.trim(), 'Read out of the key-value map by this policy.', source);
      }
    }

    if (tag === 'LookupCache') {
      add(found, text(root.querySelector(':scope > AssignTo')), 'Cache hit is written here by this policy.', source);
    }

    if (tag === 'ServiceCallout') {
      const response = text(root.querySelector(':scope > Response'));
      if (response) {
        add(found, response, 'Callout response message from this policy.', source);
        add(found, `${response}.content`, 'Body of the callout response.', source);
        add(found, `${response}.status.code`, 'Status code of the callout response.', source);
      }
    }

    if (tag === 'VerifyAPIKey') {
      const p = policy.name;
      add(found, `verifyapikey.${p}.client_id`, 'Consumer key this policy accepted.', source);
      add(found, `verifyapikey.${p}.apiproduct.name`, 'API product this policy matched.', source);
      add(found, `verifyapikey.${p}.developer.email`, 'Developer owning the calling app.', source);
      add(found, `verifyapikey.${p}.developer.app.name`, 'Calling app name.', source);
    }

    if (tag === 'VerifyJWT' || tag === 'DecodeJWT') {
      const p = policy.name;
      add(found, `jwt.${p}.valid`, 'Whether this policy accepted the token.', source);
      add(found, `jwt.${p}.decoded.claim.sub`, 'The `sub` claim decoded by this policy.', source);
      // Claims this policy explicitly names are the ones actually available.
      for (const claim of root.querySelectorAll('AdditionalClaims Claim[name], Claim[name]')) {
        const name = claim.getAttribute('name')!.trim();
        add(found, `jwt.${p}.decoded.claim.${name}`, `The \`${name}\` claim decoded by this policy.`, source);
      }
    }

    if (tag === 'Quota') {
      const p = policy.name;
      add(found, `ratelimit.${p}.allowed.count`, 'Ceiling enforced by this Quota policy.', source);
      add(found, `ratelimit.${p}.used.count`, 'Consumed so far in the current window.', source);
      add(found, `ratelimit.${p}.exceed.count`, 'How far over the quota this caller has gone.', source);
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Everything offered for a `{…}` reference, proxy-defined names first: they're
 * the ones that are easy to get wrong and impossible to look up.
 */
export function flowVariablesFor(policies: PolicyLike[]): FlowVariableDef[] {
  return [...harvestProxyVariables(policies), ...APIGEE_FLOW_VARIABLES, ...APIGEE_POLICY_OUTPUT_VARIABLES];
}
