import { parser, text } from './xmlImportUtils.js';

/**
 * External org/environment artifacts this bundle depends on but does not
 * contain. The zip is only half a deployment — the other half (Target
 * Servers, KVMs, caches, shared flows, API Products, ...) lives in the org
 * and stays invisible until the proxy fails at deploy or first request.
 *
 * Each: { kind, name, source, detail, cli }
 *   kind   — 'targetServer' | 'keystore' | 'truststore' | 'kvm' | 'cache'
 *          | 'serviceAccount' | 'sharedFlow' | 'apiProduct'
 *   source — where in the proxy it came from, for "why is this here?"
 *   detail — extra context; the only field for kinds with no CLI template,
 *            and also how a runtime-variable-named reference is surfaced
 *            (can't be resolved statically, so it's listed as an advisory
 *            rather than silently dropped)
 *   cli    — an apigeecli command template with $ORG/$ENV/$TOKEN
 *            placeholders, or null where one would misrepresent what's
 *            actually needed (a keystore needs certificate material, a
 *            service account needs IAM bindings, an API Product needs
 *            configuration — a one-liner can't create any of those)
 */

const CLI = {
  targetServer: (n) => `apigeecli targetservers create --name ${n} --host HOST --port 443 --enable=true --org $ORG --env $ENV --token $TOKEN`,
  kvm: (n) => `apigeecli kvms create --name ${n} --org $ORG --env $ENV --token $TOKEN`,
  cache: (n) => `apigeecli caches create --name ${n} --org $ORG --env $ENV --token $TOKEN`,
  sharedFlow: (n) =>
    `apigeecli sharedflows import -f ./${n}.zip --org $ORG --token $TOKEN && apigeecli sharedflows deploy --name ${n} --org $ORG --env $ENV --token $TOKEN`,
};

function isRuntimeVariable(name) {
  return typeof name === 'string' && /\{[^}]+\}/.test(name);
}

// A name that's a flow variable is resolved per-request — there's no single
// static artifact to name a CLI command at, so it's listed as a detail-only
// advisory (cli: null) rather than silently omitted.
function variableDetail(kind, label, name) {
  return `${label} is a runtime variable ("${name}") — resolved per request, so it can't be checked or named statically. Make sure every ${kind} it might resolve to exists in the environment.`;
}

function addItem(items, seen, item) {
  const key = `${item.kind}:${item.name}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

function rootTagOf(policyXml) {
  let parsed;
  try {
    parsed = parser.parse(policyXml);
  } catch {
    return null;
  }
  const tag = Object.keys(parsed).find((k) => !k.startsWith('?'));
  return tag ? { tag, node: parsed[tag] } : null;
}

export function collectPrerequisites(proxy) {
  const items = [];
  const seen = new Set();

  // 1. Targets — Target Servers, keystores/truststores, service accounts.
  for (const target of proxy.targets || []) {
    if (target.mode === 'targetServer') {
      for (const name of target.targetServers || []) {
        if (!name) continue;
        if (isRuntimeVariable(name)) {
          addItem(items, seen, {
            kind: 'targetServer',
            name,
            source: `Target "${target.name}"`,
            detail: variableDetail('Target Server', 'Target Server name', name),
            cli: null,
          });
        } else {
          addItem(items, seen, { kind: 'targetServer', name, source: `Target "${target.name}"`, detail: null, cli: CLI.targetServer(name) });
        }
      }
    }
    const ssl = target.sslInfo;
    if (ssl?.enabled) {
      if (ssl.keyStore) {
        addItem(items, seen, {
          kind: 'keystore',
          name: ssl.keyStore,
          source: `Target "${target.name}" SSLInfo`,
          detail: 'Must exist in the target environment and hold the certificate/key this proxy presents (mutual TLS). Create it via the console or `apigeecli keystores create` plus a certificate upload — no one-line command covers both.',
          cli: null,
        });
      }
      if (ssl.trustStore) {
        addItem(items, seen, {
          kind: 'truststore',
          name: ssl.trustStore,
          source: `Target "${target.name}" SSLInfo`,
          detail: 'Must exist in the target environment and contain the CA certificate(s) needed to trust the backend.',
          cli: null,
        });
      }
    }
    if (target.authentication && target.authentication.mode !== 'none') {
      const authLabel = target.authentication.mode === 'googleAccessToken' ? 'GoogleAccessToken' : 'GoogleIDToken';
      addItem(items, seen, {
        kind: 'serviceAccount',
        name: `${target.name} runtime identity`,
        source: `Target "${target.name}" Authentication`,
        detail: `The environment's Google-managed service account needs the right IAM role on the backend for this ${authLabel} call to succeed (e.g. roles/run.invoker for Cloud Run, roles/cloudfunctions.invoker for Cloud Functions).`,
        cli: null,
      });
    }
  }

  // 2. Policies — dispatched on root XML tag.
  for (const policy of proxy.policies || []) {
    const parsed = rootTagOf(policy.xml);
    if (!parsed) continue;
    const { tag, node } = parsed;
    if (!node || typeof node !== 'object') continue;

    if (tag === 'KeyValueMapOperations') {
      const mapId = node['@_mapIdentifier'];
      if (!mapId) continue;
      if (isRuntimeVariable(mapId)) {
        addItem(items, seen, { kind: 'kvm', name: mapId, source: `Policy "${policy.name}"`, detail: variableDetail('KVM', 'Map identifier', mapId), cli: null });
      } else {
        addItem(items, seen, { kind: 'kvm', name: mapId, source: `Policy "${policy.name}"`, detail: null, cli: CLI.kvm(mapId) });
      }
    } else if (tag === 'PopulateCache' || tag === 'LookupCache' || tag === 'InvalidateCache') {
      const cacheName = node.CacheResource != null ? text(node.CacheResource) : '';
      // "default" is Apigee's built-in shared cache — it always exists.
      if (!cacheName || cacheName === 'default') continue;
      if (isRuntimeVariable(cacheName)) {
        addItem(items, seen, { kind: 'cache', name: cacheName, source: `Policy "${policy.name}"`, detail: variableDetail('cache', 'Cache name', cacheName), cli: null });
      } else {
        addItem(items, seen, { kind: 'cache', name: cacheName, source: `Policy "${policy.name}"`, detail: null, cli: CLI.cache(cacheName) });
      }
    } else if (tag === 'FlowCallout') {
      const sfName = node.SharedFlowBundle != null ? text(node.SharedFlowBundle) : '';
      if (!sfName) continue;
      if (isRuntimeVariable(sfName)) {
        addItem(items, seen, {
          kind: 'sharedFlow',
          name: sfName,
          source: `Policy "${policy.name}"`,
          detail: variableDetail('shared flow', 'Shared flow name', sfName),
          cli: null,
        });
      } else {
        addItem(items, seen, { kind: 'sharedFlow', name: sfName, source: `Policy "${policy.name}"`, detail: null, cli: CLI.sharedFlow(sfName) });
      }
    } else if (tag === 'VerifyAPIKey') {
      addItem(items, seen, {
        kind: 'apiProduct',
        name: 'any product containing this proxy',
        source: `Policy "${policy.name}"`,
        detail: 'An API Product must exist, include this proxy, and be added to a Developer App whose key is presented on the request.',
        cli: null,
      });
    } else if (tag === 'OAuthV2') {
      const op = node.Operation != null ? text(node.Operation) : '';
      if (op !== 'VerifyAccessToken') continue;
      addItem(items, seen, {
        kind: 'apiProduct',
        name: 'any product containing this proxy',
        source: `Policy "${policy.name}"`,
        detail: 'An API Product must exist, include this proxy, and be associated with the OAuth token being verified.',
        cli: null,
      });
    }
  }

  return items;
}
