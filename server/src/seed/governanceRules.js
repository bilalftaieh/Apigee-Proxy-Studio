/**
 * House rules — the standards *your org* wants every proxy to meet, as opposed
 * to the ones Apigee enforces (apigeelint) or the ones that stop a bundle
 * deploying at all (deployChecks.js).
 *
 * These deliberately never block an export. A governance finding means "this
 * proxy is unlike the others in a way somebody should have decided on", which
 * is a conversation, not a build failure. Waive one per proxy by adding its id
 * to that proxy's `lintExcludes` — the Lint tab already renders and un-waives
 * those, so there's no second mechanism to learn.
 *
 * This file is meant to be edited. Delete rules that don't match how you work,
 * change severities, add your own — a rule is just `check(proxy, ctx)`
 * returning zero or more message strings.
 *
 * `ctx` (built once per proxy by workspaceAudit.js) carries:
 *   policyByName        Map<string, Policy>
 *   attachedNames       Set<string> — policies actually wired into some Step
 *   attachedTypes       Set<string> — the types of those policies
 *   proxyRequestTypes   Set<string> — types on the ProxyEndpoint *request*
 *                       path specifically (PreFlow / conditional flows /
 *                       PostFlow request), which is where a gate has to sit to
 *                       actually gate anything
 */

/** Policy types that constitute "the caller was authenticated". */
const AUTH_TYPES = ['VerifyAPIKey', 'OAuthV2', 'VerifyJWT', 'VerifyJWS', 'JWTDecoder', 'BasicAuthentication', 'ExternalCallout'];

/** Policy types that constitute "this proxy cannot be hammered". */
const TRAFFIC_TYPES = ['SpikeArrest', 'Quota'];

const SECRET_ISH = /authorization|api[_-]?key|client[_-]?secret|password|passwd|bearer/i;

function has(set, types) {
  return types.some((t) => set.has(t));
}

export const GOVERNANCE_RULES = [
  {
    id: 'GOV001',
    label: 'Proxy has a DefaultFaultRule',
    severity: 'warning',
    rationale:
      "Without one, any unhandled fault returns Apigee's raw default error — which leaks policy names and internal fault strings to the caller, and gives your consumers an error shape that differs from every other proxy you run.",
    check(proxy) {
      const steps = proxy.faultRules?.steps || [];
      if (steps.length) return [];
      // A conditional FaultRule with no condition always matches, so it covers
      // every fault exactly as a DefaultFaultRule would. One that *has* a
      // condition does not — a fault it doesn't match still falls through to
      // Apigee's built-in response, which is what this rule is about.
      if ((proxy.faultRules?.rules || []).some((r) => !r.condition && (r.steps || []).length)) return [];
      return ['No DefaultFaultRule on the ProxyEndpoint — unhandled faults will return Apigee\'s built-in error response.'];
    },
  },
  {
    id: 'GOV002',
    label: 'Proxy is rate-limited',
    severity: 'warning',
    rationale:
      'A proxy with no SpikeArrest or Quota anywhere on the request path will pass an unbounded request rate straight through to the backend. This is the rule most worth enforcing across a whole org rather than per proxy.',
    check(proxy, ctx) {
      if (has(ctx.proxyRequestTypes, TRAFFIC_TYPES)) return [];
      // A FlowCallout may well be applying it in a shared flow — say so rather
      // than asserting the proxy is unprotected, which would be a false claim.
      if (ctx.proxyRequestTypes.has('FlowCallout')) {
        return ['No SpikeArrest or Quota on the request path. A FlowCallout is attached, so this may be handled in a shared flow — worth confirming.'];
      }
      return ['No SpikeArrest or Quota anywhere on the request path — this proxy passes an unbounded request rate to its backend.'];
    },
  },
  {
    id: 'GOV003',
    label: 'Proxy authenticates the caller',
    severity: 'warning',
    rationale:
      'An unauthenticated proxy is occasionally correct (a health check, a public lookup) but should always be a decision rather than an omission.',
    check(proxy, ctx) {
      if (has(ctx.proxyRequestTypes, AUTH_TYPES)) return [];
      if (ctx.proxyRequestTypes.has('FlowCallout')) {
        return ['No auth policy on the request path. A FlowCallout is attached, so this may be handled in a shared flow — worth confirming.'];
      }
      return [`No auth policy (${AUTH_TYPES.slice(0, 4).join(', ')}, …) on the request path — this proxy is open to anyone who can reach it.`];
    },
  },
  {
    id: 'GOV004',
    label: 'Backends are reached over TLS',
    severity: 'error',
    rationale:
      'A plain-http target sends every request — headers, tokens and body — unencrypted from the Apigee runtime to your backend. Inside a VPC that is sometimes accepted deliberately; it should never be accidental.',
    check(proxy) {
      const out = [];
      for (const target of proxy.targets || []) {
        if (target.mode !== 'url') continue;
        const url = target.url?.mode === 'variable' ? '' : String(target.url?.value || '');
        if (/^http:\/\//i.test(url)) out.push(`Target "${target.name}" calls ${url} over plain http.`);
      }
      for (const rule of proxy.routeRules || []) {
        if (rule.mode === 'url' && /^http:\/\//i.test(String(rule.url || ''))) {
          out.push(`RouteRule "${rule.name}" calls ${rule.url} over plain http.`);
        }
      }
      return out;
    },
  },
  {
    id: 'GOV005',
    label: 'CORS does not use a wildcard origin',
    severity: 'warning',
    rationale:
      'AllowOrigins "*" lets any site on the internet call this API from a browser with the user\'s context. apigeelint flags this too (PO032) — the point of repeating it here is seeing every proxy that does it in one pass instead of linting seven bundles.',
    check(proxy, ctx) {
      const out = [];
      for (const policy of proxy.policies || []) {
        if (policy.type !== 'CorsHeaders' && policy.type !== 'CORS') continue;
        if (!ctx.attachedNames.has(policy.name)) continue;
        if (/<AllowOrigins>\s*\*\s*<\/AllowOrigins>/.test(policy.xml || '')) {
          out.push(`CORS policy "${policy.name}" allows any origin ("*").`);
        }
      }
      return out;
    },
  },
  {
    id: 'GOV006',
    label: 'Credentials are not written to logs',
    severity: 'warning',
    rationale:
      'A MessageLogging policy that interpolates an Authorization header or an API key ships that credential to Cloud Logging, where it is retained, indexed, and readable by anyone with log access. This is the cheapest real compliance check in the tool.',
    check(proxy, ctx) {
      const out = [];
      for (const policy of proxy.policies || []) {
        if (policy.type !== 'MessageLogging') continue;
        if (!ctx.attachedNames.has(policy.name)) continue;
        const matches = [...new Set((String(policy.xml || '').match(SECRET_ISH) || []))];
        if (matches.length) {
          out.push(`MessageLogging policy "${policy.name}" mentions ${matches.map((m) => `"${m}"`).join(', ')} — check no credential is being written to the log.`);
        }
      }
      return out;
    },
  },
  {
    id: 'GOV007',
    label: 'Base path carries a version',
    severity: 'info',
    rationale:
      'An unversioned base path has no way to ship a breaking change without breaking every caller. Purely a convention — drop this rule if it is not yours.',
    check(proxy) {
      if (/\/v\d+(\/|$)/i.test(String(proxy.basePath || ''))) return [];
      return [`Base path "${proxy.basePath}" has no /v<n> segment.`];
    },
  },
  {
    id: 'GOV008',
    label: 'Proxy has a description',
    severity: 'info',
    rationale:
      'The description is what shows up in the Apigee console proxy list and in the generated OpenAPI spec. Blank means whoever finds this proxy in six months has only its name to go on.',
    check(proxy) {
      if (String(proxy.description || '').trim()) return [];
      return ['No description set.'];
    },
  },
];
