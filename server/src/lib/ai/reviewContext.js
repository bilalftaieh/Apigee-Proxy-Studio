// The model's view of a whole proxy.
//
// This is by far the widest window any AI feature in this app opens, and it is
// the one to be most careful with. Generating a policy needs a grammar; fixing
// one needs that policy's XML; reviewing a proxy needs to know what runs, in
// what order, under what conditions — which is most of the design.
//
// Three rules keep that honest:
//
//   1. It is still an allowlist. Every field below is named on purpose. A
//      field added to the proxy model later is invisible here by default.
//   2. EVERY string goes through the pseudonymizer, including names that are
//      "obviously" structural. A policy named after a backend is not a rare
//      thing to find in a real workspace, and the leak guard fails closed —
//      one such name would abort the request with a message telling the user
//      they have found a bug. Pseudonymizing a name that needed no
//      pseudonymizing costs nothing; the reverse costs a working feature.
//   3. Backend destinations are not included in any form. Not the URL, not the
//      TargetServer names, not the environment overrides. What a review needs
//      to know about a target is how it is wired, not where it points.
//
// What IS here that a policy-level feature never sees: the execution order of
// every step in the proxy. That single list is what the whole feature rests on,
// because almost every problem a linter cannot catch is a problem of order —
// a quota counted after the call it was meant to protect, an authentication
// check that runs after the thing it was meant to guard.

import { iterateSteps } from '../deployChecks.js';
import { collectProxySecrets, createRedactionMap, pseudonymize } from './redact.js';

// Policy XML is included because the most useful findings need it: whether a
// cache key separates one caller's data from another's is not answerable from
// the policy's type. These caps stop a large workspace turning one review into
// an enormous request — and a policy whose XML runs past the per-policy cap is
// almost always a Javascript or XSL body, where the tail adds little.
const PER_POLICY_XML_CHARS = 1500;
const TOTAL_XML_CHARS = 50_000;

/** Pseudonymize, tolerating undefined, so callers can inline it everywhere. */
function safe(value, map) {
  return value == null || value === '' ? '' : pseudonymize(String(value), map);
}

function truncate(xml, limit) {
  const trimmed = String(xml || '').trim();
  if (trimmed.length <= limit) return { text: trimmed, truncated: false };
  return { text: `${trimmed.slice(0, limit)}\n<!-- … truncated … -->`, truncated: true };
}

/**
 * Policy name, type and (within budget) XML.
 *
 * The XML budget is spent in the order policies are declared rather than on the
 * smallest first: a proxy's policies are usually declared in roughly the order
 * they run, so spending the budget in that order keeps the request path — where
 * the interesting findings are — intact, and drops the tail.
 */
function buildPolicyCatalogue(policies, map) {
  const entries = [];
  const omitted = [];
  let spent = 0;

  for (const policy of policies || []) {
    const name = safe(policy.name, map);
    const entry = { name, type: policy.type };
    const { text, truncated } = truncate(policy.xml, PER_POLICY_XML_CHARS);
    const pseudonymized = safe(text, map);

    if (spent + pseudonymized.length <= TOTAL_XML_CHARS) {
      entry.xml = pseudonymized;
      if (truncated) entry.xmlTruncated = true;
      spent += pseudonymized.length;
    } else {
      omitted.push(name);
    }
    entries.push(entry);
  }

  return { entries, omitted };
}

/**
 * Every step in the proxy, in the order Apigee runs them.
 *
 * Reuses iterateSteps rather than walking the model again, so the order the
 * model reasons about is the same order the deploy checks walk and the same
 * order the bundle generator writes — three readings of "what runs when" that
 * agree because there is only one of them.
 */
function buildExecutionOrder(proxy, typeByName, map) {
  const steps = [];
  for (const { step, where } of iterateSteps(proxy)) {
    steps.push({
      where: safe(where, map),
      policy: safe(step.policyName, map),
      type: typeByName.get(step.policyName) || 'unknown',
      ...(step.condition ? { condition: safe(step.condition, map) } : {}),
    });
  }
  return steps;
}

function buildFaultHandling(faultRules, map) {
  return {
    rules: (faultRules?.rules || []).map((r) => ({
      name: safe(r.name, map),
      condition: safe(r.condition, map),
      steps: (r.steps || []).map((s) => safe(s.policyName, map)),
    })),
    defaultRuleSteps: (faultRules?.steps || []).map((s) => safe(s.policyName, map)),
  };
}

/**
 * How a target is wired. Deliberately no destination: `mode` says whether it
 * goes to a URL or a load-balanced TargetServer set, and that is the part a
 * review can reason about. Where it actually points is not.
 */
function buildTargets(targets, map) {
  return (targets || []).map((t) => ({
    name: safe(t.name, map),
    mode: t.mode || 'url',
    hasPath: Boolean(t.path?.value),
    tls: t.sslInfo?.enabled
      ? {
          clientAuth: Boolean(t.sslInfo.clientAuthEnabled),
          // The one TLS setting worth a reviewer's attention: it turns off
          // hostname and chain validation for the backend leg.
          ignoresValidationErrors: Boolean(t.sslInfo.ignoreValidationErrors),
        }
      : null,
    googleAuth: t.authentication?.mode && t.authentication.mode !== 'none' ? t.authentication.mode : null,
    hasEventFlow: Boolean(t.eventFlow?.response?.length),
    faultHandling: buildFaultHandling(t.faultRules, map),
  }));
}

export function buildReviewContext(proxy) {
  const map = collectProxySecrets(proxy, createRedactionMap());
  const typeByName = new Map((proxy.policies || []).map((p) => [p.name, p.type]));
  const { entries, omitted } = buildPolicyCatalogue(proxy.policies, map);

  const context = {
    // --- allowlist starts here: add a field only on purpose ---
    policies: entries,
    policiesWithoutXml: omitted,
    execution: buildExecutionOrder(proxy, typeByName, map),
    flows: (proxy.flows || []).map((f) => ({
      name: safe(f.name, map),
      condition: safe(f.condition, map),
      ...(f.enabled === false ? { disabled: true } : {}),
    })),
    routeRules: (proxy.routeRules || []).map((r) => ({
      name: safe(r.name, map),
      mode: r.mode || 'target',
      condition: safe(r.condition, map),
      // Named, not resolved: which target it reaches matters, where that target
      // points does not.
      target: safe(r.targetName, map),
    })),
    targets: buildTargets(proxy.targets, map),
    proxyFaultHandling: buildFaultHandling(proxy.faultRules, map),
    postClientFlowSteps: (proxy.postClientFlow?.response || []).map((s) => safe(s.policyName, map)),
    resourceCount: (proxy.resources || []).length,
    // --- allowlist ends here ---
  };

  return { context, map };
}
