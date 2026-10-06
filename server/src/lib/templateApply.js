import { nanoid } from 'nanoid';
import { normalizeProxy } from './model.js';
import { templatesStore } from './storage.js';
import { BUILT_IN_TEMPLATES } from '../seed/templates.js';

/**
 * A template id can name a built-in (which lives in code, not on disk) or a
 * user-saved one. Both the templates route and the import routes need to
 * resolve one, so the lookup lives here rather than in either of them.
 */
export async function findTemplate(id) {
  const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
  if (builtIn) return builtIn;
  return templatesStore.get(id);
}

/**
 * Overlays a template's *policy layer* onto a proxy that already has an *API
 * surface*.
 *
 * The two halves of a proxy come from different places. An importer
 * (OpenAPI/WSDL/curl/Postman) reads an artifact and produces the surface:
 * base path, conditional flows, target URL, route rules. A template carries
 * the governance layer someone standardised on: policies, PreFlow/PostFlow
 * attachments, fault rules. Neither is a whole proxy on its own, and until now
 * both were only ever used *as* a whole proxy — `cloneProxyFromTemplate` mints
 * one from the template and the importers mint one from the artifact, so
 * picking a template meant throwing the artifact away.
 *
 * So the merge rule is a single sentence: **the proxy owns the surface, the
 * template owns the policy layer.** Every conflict resolves toward the proxy,
 * and every one of those resolutions produces a warning. Quietly dropping half
 * of what a template said is how people stop trusting the feature, so nothing
 * is dropped silently — the caller gets warning strings it can surface exactly
 * the way the importers already surface theirs.
 *
 * Returns the merged proxy plus `changes`, a count of what was actually added,
 * which is what the UI reports back ("added 5 policies, 3 flow steps").
 */

// Appends steps that aren't already attached to this flow, template-first: the
// template's policies are the gate (auth, spike arrest), so they have to run
// before whatever the artifact's own importer scaffolded.
function mergeSteps(templateSteps, proxySteps) {
  const existing = new Set((proxySteps || []).map((s) => s.policyName));
  const added = (templateSteps || []).filter((s) => s?.policyName && !existing.has(s.policyName));
  return { steps: [...added, ...(proxySteps || [])], added: added.length };
}

function mergeFlowPair(templateFlow, proxyFlow) {
  const request = mergeSteps(templateFlow?.request, proxyFlow?.request);
  const response = mergeSteps(templateFlow?.response, proxyFlow?.response);
  return {
    flow: { request: request.steps, response: response.steps },
    added: request.added + response.added,
  };
}

// Fault handling is all-or-nothing rather than merged. A fault rule list is
// evaluated top-to-bottom and the first match wins, so interleaving two
// independently-written lists produces handling neither author intended.
function mergeFaultRules(templateFr, proxyFr) {
  const proxyHas = (proxyFr?.rules?.length || 0) > 0 || (proxyFr?.steps?.length || 0) > 0;
  const templateHas = (templateFr?.rules?.length || 0) > 0 || (templateFr?.steps?.length || 0) > 0;
  if (!templateHas) return { faultRules: proxyFr, added: 0, skipped: false };
  if (proxyHas) return { faultRules: proxyFr, added: 0, skipped: true };
  const rules = (templateFr.rules || []).map((r) => ({ ...r, id: nanoid(8) }));
  return {
    faultRules: { rules, steps: [...(templateFr.steps || [])] },
    added: rules.length + (templateFr.steps?.length || 0),
    skipped: false,
  };
}

export function applyTemplateToProxy(proxy, template) {
  const tpl = JSON.parse(JSON.stringify(template?.proxy || {}));
  const warnings = [];
  const changes = { policies: 0, flowSteps: 0, flows: 0, faultRules: 0, resources: 0 };

  // --- policies --------------------------------------------------------
  // A step refers to a policy by name, so a name collision is not a duplicate
  // id to paper over: the proxy already has a policy that the template's own
  // steps will now point at. Keeping the proxy's copy is the rule, and the
  // warning says which XML the user is *not* getting.
  const takenNames = new Set((proxy.policies || []).map((p) => p.name));
  const takenIds = new Set((proxy.policies || []).map((p) => p.id));
  const addedPolicies = [];
  for (const p of tpl.policies || []) {
    if (takenNames.has(p.name)) {
      warnings.push(`Kept this proxy's existing "${p.name}" policy — the template's version of it was not applied.`);
      continue;
    }
    takenNames.add(p.name);
    const id = p.id && !takenIds.has(p.id) ? p.id : nanoid(8);
    takenIds.add(id);
    addedPolicies.push({ ...p, id });
  }
  changes.policies = addedPolicies.length;

  // --- proxy-level flows ------------------------------------------------
  const pre = mergeFlowPair(tpl.preFlow, proxy.preFlow);
  const post = mergeFlowPair(tpl.postFlow, proxy.postFlow);
  const postClient = mergeSteps(tpl.postClientFlow?.response, proxy.postClientFlow?.response);
  changes.flowSteps = pre.added + post.added + postClient.added;

  // --- conditional flows ------------------------------------------------
  // The imported flows are the API surface and keep their order and their
  // place at the front; a template flow is an extra (a /health short-circuit,
  // a catch-all fallback) and goes after them. A template flow whose condition
  // an imported flow already matches would be dead code — Apigee runs the
  // first match only — so it is skipped rather than left in to confuse.
  const existingConditions = new Set((proxy.flows || []).map((f) => (f.condition || '').trim()));
  const addedFlows = [];
  for (const f of tpl.flows || []) {
    const condition = (f.condition || '').trim();
    if (existingConditions.has(condition)) {
      // The policies that flow used were already added above and are left in
      // place rather than swept up: they are a working starting point for
      // attaching by hand, and quietly deleting a policy the template author
      // wrote is a worse surprise than an unattached one. apigeelint flags it
      // as a warning, which is visible and never blocks export.
      const orphaned = [...(f.request || []), ...(f.response || [])].length > 0;
      warnings.push(
        `Skipped the template's "${f.name}" flow — this proxy already has a flow with the same condition.` +
          (orphaned ? ' Its policies were still added, but are not attached to anything.' : '')
      );
      continue;
    }
    existingConditions.add(condition);
    addedFlows.push({ ...f, id: nanoid(8) });
  }
  changes.flows = addedFlows.length;

  // --- fault handling ----------------------------------------------------
  const fault = mergeFaultRules(tpl.faultRules, proxy.faultRules);
  if (fault.skipped) {
    warnings.push("Kept this proxy's own fault handling — the template's fault rules were not applied.");
  }
  changes.faultRules = fault.added;

  // --- targets -----------------------------------------------------------
  // Position-matched, because that is the only correspondence available: an
  // imported target is named after the artifact's host and a template's after
  // whatever its author called it, so matching by name would match nothing.
  // The routing half (mode/url/targetServers/path) is surface and stays; only
  // the target's own policy layer comes across.
  const templateTargets = tpl.targets || [];
  const targets = (proxy.targets || []).map((t, i) => {
    const tt = templateTargets[i];
    if (!tt) return t;
    const tPre = mergeFlowPair(tt.preFlow, t.preFlow);
    const tPost = mergeFlowPair(tt.postFlow, t.postFlow);
    const tFault = mergeFaultRules(tt.faultRules, t.faultRules);
    changes.flowSteps += tPre.added + tPost.added;
    changes.faultRules += tFault.added;
    if (tFault.skipped) {
      warnings.push(`Kept target "${t.name}"'s own fault handling — the template's was not applied.`);
    }
    return { ...t, preFlow: tPre.flow, postFlow: tPost.flow, faultRules: tFault.faultRules };
  });
  if (templateTargets.length > (proxy.targets || []).length) {
    warnings.push(
      `The template defines ${templateTargets.length} targets and this proxy has ${
        proxy.targets?.length || 0
      } — the extra ones were not added, since no route rule points at them.`
    );
  }
  // The template's own backend is never what you want here: you imported this
  // proxy precisely to get its real one.
  const firstTemplateTarget = templateTargets[0];
  const firstTarget = (proxy.targets || [])[0];
  if (firstTemplateTarget && firstTarget) {
    const differs =
      firstTemplateTarget.mode !== firstTarget.mode ||
      (firstTemplateTarget.url?.value || '') !== (firstTarget.url?.value || '') ||
      (firstTemplateTarget.path?.value || '') !== (firstTarget.path?.value || '') ||
      (firstTemplateTarget.targetServers || []).join() !== (firstTarget.targetServers || []).join();
    if (differs) {
      warnings.push(
        `Kept the imported backend for target "${firstTarget.name}" — the template's own target URL / Target Server settings were not applied.`
      );
    }
  }

  // Route rules are pure surface: they name this proxy's targets, and the
  // template's name targets that were just skipped.
  if ((tpl.routeRules || []).length > 1) {
    warnings.push("Kept this proxy's route rules — the template's conditional routing was not applied.");
  }

  // --- resources ---------------------------------------------------------
  // Policy-owned resources ride along inside the policy and are folded by
  // normalizeProxy; only the proxy-level ones are merged here. First writer
  // wins on a path, matching foldPolicyResources.
  const takenPaths = new Set((proxy.resources || []).map((r) => r.path));
  const addedResources = [];
  for (const r of tpl.resources || []) {
    if (!r?.path || takenPaths.has(r.path)) continue;
    takenPaths.add(r.path);
    addedResources.push({ ...r, id: nanoid() });
  }
  changes.resources = addedResources.length;

  const merged = normalizeProxy({
    ...proxy,
    policies: [...(proxy.policies || []), ...addedPolicies],
    resources: [...(proxy.resources || []), ...addedResources],
    preFlow: pre.flow,
    postFlow: post.flow,
    postClientFlow: { response: postClient.steps },
    flows: [...(proxy.flows || []), ...addedFlows],
    faultRules: fault.faultRules,
    targets,
    updatedAt: Date.now(),
  });

  return { proxy: merged, warnings, changes };
}

/** One-line "added 5 policies, 3 flow steps" for a toast or a log line. */
export function describeChanges(changes) {
  const parts = [
    [changes.policies, 'policy', 'policies'],
    [changes.flowSteps, 'flow step', 'flow steps'],
    [changes.flows, 'conditional flow', 'conditional flows'],
    [changes.faultRules, 'fault rule', 'fault rules'],
    [changes.resources, 'resource', 'resources'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return parts.length ? `added ${parts.join(', ')}` : 'added nothing new';
}
