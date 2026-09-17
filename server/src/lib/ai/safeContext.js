// Builds the model's view of the workspace.
//
// The important property of this file is what it DOESN'T do: it never receives
// permission to walk the proxy object freely. Every field the model can see is
// named explicitly below. A field added to the proxy model later — a new target
// attribute, a new credential holder — is invisible here by default rather than
// swept along, which is the opposite of how a blocklist ages.
//
// Generating a single policy needs far less context than it might seem. The
// model needs the element grammar for the type and a sense of which flow
// variables exist; it does not need to know where your traffic actually goes.

import { getPolicyType } from '../policyTemplates.js';
import { collectProxySecrets, createRedactionMap, pseudonymize } from './redact.js';

// Documented, public Apigee variables. Sending these costs nothing — they appear
// verbatim in Google's own docs — and they measurably improve output, because the
// model stops inventing variable names and uses real ones.
const COMMON_FLOW_VARIABLES = [
  'request.verb', 'request.path', 'request.uri', 'request.queryparam.NAME',
  'request.header.NAME', 'request.formparam.NAME', 'request.content',
  'response.status.code', 'response.header.NAME', 'response.content',
  'client.ip', 'system.uuid', 'system.timestamp',
  'apiproxy.name', 'apiproxy.revision', 'environment.name', 'organization.name',
  'error.message', 'error.status.code', 'fault.name',
  'accesstoken.scope', 'client_id', 'developer.email', 'apiproduct.name',
];

export function buildSafeContext(proxy, { policyType, intent } = {}) {
  // Registering the proxy's sensitive literals first is what allows the intent
  // text below to be scrubbed by exact match, not just by pattern — if the user
  // types a hostname that is genuinely one of their targets, it is caught even
  // when it is spelled in a way no regex would flag.
  const map = collectProxySecrets(proxy, createRedactionMap());

  const type = policyType ? getPolicyType(policyType) : null;

  const context = {
    // --- allowlist starts here: add a field only on purpose ---
    policyType: type?.key || null,
    policyRootTag: type ? type.xmlTag || type.key : null,
    policyLabel: type?.label || null,
    policyCategory: type?.category || null,
    template: type ? type.defaultXml('PolicyName') : null,
    commonFlowVariables: COMMON_FLOW_VARIABLES,
    // The user's own words are the likeliest carrier of a real hostname, so they
    // go through the pseudonymizer like everything else.
    intent: pseudonymize(intent || '', map),
    // --- allowlist ends here ---
  };

  return { context, map };
}

// The catalogue the model chooses from when the user hasn't picked a type.
// Names and descriptions only — these come from our own static template file,
// not from the user's workspace.
export function policyTypeCatalogue(policyTypes) {
  return policyTypes.map((t) => ({
    key: t.key,
    label: t.label,
    category: t.category,
    description: t.description,
  }));
}

/**
 * The model's view of one policy that needs fixing.
 *
 * This is a WIDER window than buildSafeContext opens, and deliberately so: you
 * cannot repair a policy you are not allowed to read. The extra field is the
 * policy's own XML, and it goes through the pseudonymizer like everything else
 * — a KVM name, a backend URL or a TargetServer sitting in that XML is replaced
 * before it is sent and restored in the answer.
 *
 * The finding's text is pseudonymized for the same reason and with more cause:
 * a deploy blocker quotes the offending value back at you, so the message for a
 * bad target is literally the backend URL.
 *
 * Still an allowlist. Nothing about the rest of the workspace — the other
 * policies, the flows, the targets — is included, because fixing a policy's own
 * XML does not need it.
 */
export function buildFixContext(proxy, { policy, finding } = {}) {
  const map = collectProxySecrets(proxy, createRedactionMap());
  const type = getPolicyType(policy?.type);

  const context = {
    // --- allowlist starts here: add a field only on purpose ---
    policyType: type?.key || null,
    policyRootTag: type ? type.xmlTag || type.key : null,
    policyLabel: type?.label || null,
    policyCategory: type?.category || null,
    // Not pseudonymized: policy names are structural, they appear in the Steps
    // the user reads every day, and the model has to echo this one back
    // unchanged. They are not in the secret set anywhere else either.
    policyName: policy?.name || '',
    currentXml: pseudonymize(policy?.xml || '', map),
    ruleId: finding?.ruleId || null,
    problem: pseudonymize(finding?.message || '', map),
    commonFlowVariables: COMMON_FLOW_VARIABLES,
    // --- allowlist ends here ---
  };

  return { context, map };
}
