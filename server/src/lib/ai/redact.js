// Pseudonymizer for anything leaving this machine for a third-party model.
//
// This does NOT delete sensitive values — it swaps them for stable placeholders
// ({{URL_1}}) and swaps them back into whatever the model returns. That matters
// for quality: plain redaction leaves the model guessing what a stripped field
// was, while a placeholder still tells it "a target URL belongs here", and the
// caller gets real, usable XML back.
//
// A consequence worth knowing when reading the detectors below: because every
// substitution is reversible, OVER-redacting is safe. If we placeholder
// something that turned out to be harmless, restore() puts it back and the only
// cost is that the model had slightly less context to work with. UNDER-redacting
// is the failure that actually matters, so the detectors lean greedy.

// Apigee flow variables are dotted identifiers that look exactly like hostnames
// to a regex (`request.header.host`, `system.uuid`). They are public, documented
// names with no customer data in them, and the model needs to read them to place
// elements correctly — so these namespaces are exempt from hostname detection.
const APIGEE_VARIABLE_NAMESPACES = new Set([
  'request', 'response', 'message', 'error', 'fault', 'faultrule',
  'system', 'client', 'target', 'proxy', 'route', 'router', 'servlet',
  'apiproxy', 'environment', 'organization', 'organizationname',
  'application', 'developer', 'apiproduct', 'accesstoken', 'authorization',
  'oauthv2', 'jwt', 'ratelimit', 'quota', 'cache', 'loggingmessage',
  'is', 'current', 'servicecallout', 'graphql', 'tls', 'virtualhost',
]);

// Ordered most-specific first: a URL must be consumed whole before the bare
// hostname detector gets a chance to nibble the host out of the middle of it.
const DETECTORS = [
  { kind: 'URL', pattern: /\bhttps?:\/\/[^\s"'<>)\]},]+/gi },
  { kind: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'IP', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: 'HOST', pattern: /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{1,23}\b/g },
  // Long unbroken base64/hex-ish runs: API keys, client secrets, certificate
  // bodies, JWT segments. 28 is above the length of any Apigee element name or
  // conventional policy name, so ordinary XML identifiers don't trip it.
  { kind: 'SECRET', pattern: /\b[A-Za-z0-9+/_-]{28,}={0,2}\b/g },
];

export function createRedactionMap() {
  return { forward: new Map(), reverse: new Map(), counters: new Map() };
}

// Registers a literal and returns its placeholder. Idempotent: the same real
// value always maps to the same token within one request, so the model sees a
// consistent identity (two mentions of the same host stay recognizably the same
// host) without ever seeing the value.
export function registerSecret(map, value, kind = 'VALUE') {
  const real = String(value ?? '').trim();
  if (!real) return '';
  if (map.forward.has(real)) return map.forward.get(real);

  const next = (map.counters.get(kind) || 0) + 1;
  map.counters.set(kind, next);
  const token = `{{${kind}_${next}}}`;
  map.forward.set(real, token);
  map.reverse.set(token, real);
  return token;
}

function isExemptVariable(match) {
  return APIGEE_VARIABLE_NAMESPACES.has(match.split('.')[0].toLowerCase());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches a registered value only when it stands alone, not when it happens to
// sit inside a longer word.
//
// This matters more than it looks. TargetServer and KVM names are often short
// and generic — a target server literally named `api` is ordinary — and a plain
// substring replacement would rewrite every "api" in the prompt, turning
// "Apigee" into "{{TARGETSERVER_1}}gee" and quietly destroying the grammar the
// model depends on. The boundaries are identifier characters rather than \b so
// that hostnames and URLs, which contain dots and slashes, still match cleanly
// at their real edges.
function boundedPattern(value) {
  return new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(value)}(?![A-Za-z0-9_-])`, 'g');
}

// Replaces every already-registered literal plus anything the detectors find.
// Registered values go first and are matched as plain substrings, so a hostname
// we KNOW is sensitive is caught even when it appears in a form no regex would
// recognize (embedded in a connection string, say).
export function pseudonymize(text, map) {
  if (!text) return '';
  let out = String(text);

  const known = [...map.forward.keys()].sort((a, b) => b.length - a.length);
  for (const real of known) {
    out = out.replace(boundedPattern(real), map.forward.get(real));
  }

  for (const { kind, pattern } of DETECTORS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), (match) => {
      // Don't re-process a placeholder we just wrote. {{URL_1}} is alphanumeric
      // enough to look like a HOST to the next detector in the list.
      if (/^\{\{[A-Z]+_\d+\}\}$/.test(match)) return match;
      if (kind === 'HOST' && isExemptVariable(match)) return match;
      return registerSecret(map, match, kind);
    });
  }

  return out;
}

// Puts the real values back. Runs on model output before the caller ever sees it.
export function restore(text, map) {
  if (!text) return '';
  let out = String(text);
  for (const [token, real] of map.reverse) {
    out = out.split(token).join(real);
  }
  return out;
}

// A target and an environment's override of one carry the same destination
// fields, so both go through here rather than through two copies that drift.
function registerTargetSecrets(map, target) {
  if (!target) return;
  if (target.url?.value) registerSecret(map, target.url.value, 'URL');
  if (target.path?.value) registerSecret(map, target.path.value, 'PATH');
  for (const server of target.targetServers || []) {
    const name = typeof server === 'string' ? server : server?.name;
    if (name) registerSecret(map, name, 'TARGETSERVER');
  }
}

// Walks the proxy for fields we know carry customer-identifying values and
// registers each one up front. This is what lets pseudonymize() catch them by
// exact substring anywhere they later appear — including inside the user's own
// typed description, which is where they are most likely to show up.
export function collectProxySecrets(proxy, map) {
  if (!proxy) return map;

  // The workspace's own identity. None of this reaches the prompt by any path
  // today, but it is exactly what a user types into the intent box — "add
  // caching to acme-payments" — and registering it here is what lets
  // pseudonymize() catch it there.
  if (proxy.name) registerSecret(map, proxy.name, 'PROXYNAME');
  if (proxy.basePath) registerSecret(map, proxy.basePath, 'BASEPATH');

  for (const target of proxy.targets || []) {
    registerTargetSecrets(map, target);
    if (target?.sslInfo?.keyStore) registerSecret(map, target.sslInfo.keyStore, 'KEYSTORE');
    if (target?.sslInfo?.trustStore) registerSecret(map, target.sslInfo.trustStore, 'KEYSTORE');
  }

  // Per-environment overrides hold a SECOND set of backends — the staging and
  // production hostnames — and they are easy to forget precisely because the
  // target they override already looks handled.
  for (const env of proxy.environments || []) {
    if (env?.name) registerSecret(map, env.name, 'ENVIRONMENT');
    for (const override of Object.values(env?.targetOverrides || {})) {
      registerTargetSecrets(map, override);
    }
  }

  for (const rule of proxy.routeRules || []) {
    if (rule?.url) registerSecret(map, rule.url, 'URL');
  }

  // KVM and KeyStore names live in policy XML rather than in structured model
  // fields, so they are pulled out by element name.
  for (const policy of proxy.policies || []) {
    for (const [, name] of String(policy?.xml || '').matchAll(/<mapIdentifier[^>]*>([^<]+)<\/mapIdentifier>/gi)) {
      registerSecret(map, name.trim(), 'KVM');
    }
    for (const [, name] of String(policy?.xml || '').matchAll(/<MapName[^>]*>([^<]+)<\/MapName>/gi)) {
      registerSecret(map, name.trim(), 'KVM');
    }
  }

  return map;
}

// The deny-set for the outbound guard: every literal we believe is sensitive.
export function secretValues(map) {
  return [...map.forward.keys()];
}
