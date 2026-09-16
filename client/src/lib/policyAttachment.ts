import type { Proxy, Step } from '../types/proxy';

/**
 * Where a policy is attached, and therefore whether it runs at all.
 *
 * This is the fact the policy list was missing. A policy in `Proxy.policies`
 * that no Step references still gets written into the exported bundle and still
 * shows up in the Policies tab — it just never executes. Nothing in the UI said
 * so, and in a proxy with twenty-odd policies that is not something you can
 * work out by reading.
 */

/** Display buckets, in the order a request actually passes through them. */
export type AttachmentGroup =
  | 'proxy-request'
  | 'proxy-response'
  | 'target-request'
  | 'target-response'
  | 'fault'
  | 'unattached';

export const GROUP_ORDER: AttachmentGroup[] = [
  'proxy-request',
  'target-request',
  'target-response',
  'proxy-response',
  'fault',
  'unattached',
];

export const GROUP_LABELS: Record<AttachmentGroup, string> = {
  'proxy-request': 'Proxy Endpoint · Request',
  'target-request': 'Target Endpoint · Request',
  'target-response': 'Target Endpoint · Response',
  'proxy-response': 'Proxy Endpoint · Response',
  fault: 'Fault handling',
  unattached: 'Not attached',
};

/** One concrete place a policy is referenced from, named the way the XML names it. */
export interface AttachmentSite {
  group: AttachmentGroup;
  /** e.g. "PreFlow", "Health Check", "DefaultFaultRule" — the flow, not the phase. */
  where: string;
}

export interface PolicyAttachment {
  /** Every site, in flow order. Empty means the policy never runs. */
  sites: AttachmentSite[];
  /** The bucket the policy is listed under — its first site, or 'unattached'. */
  group: AttachmentGroup;
}

function collect(
  steps: Step[] | undefined,
  group: AttachmentGroup,
  where: string,
  into: Map<string, AttachmentSite[]>
): void {
  for (const step of steps ?? []) {
    const list = into.get(step.policyName);
    if (list) list.push({ group, where });
    else into.set(step.policyName, [{ group, where }]);
  }
}

/**
 * Maps every policy *name* (Steps reference policies by name, not id) to where
 * it is attached. Walks the endpoints in request order so the first site found
 * is the earliest one, which is the bucket the list groups under.
 *
 * Disabled flows are still walked: `Flow.enabled === false` keeps the flow's
 * steps in the proxy so it can be switched back on, and a policy held only by
 * one of those is better described as attached-but-off than as unattached.
 */
export function buildPolicyAttachments(proxy: Proxy): Map<string, PolicyAttachment> {
  const sites = new Map<string, AttachmentSite[]>();

  collect(proxy.preFlow?.request, 'proxy-request', 'PreFlow', sites);
  for (const flow of proxy.flows) collect(flow.request, 'proxy-request', flow.name, sites);
  collect(proxy.postFlow?.request, 'proxy-request', 'PostFlow', sites);

  for (const target of proxy.targets) {
    collect(target.preFlow?.request, 'target-request', `${target.name} PreFlow`, sites);
    for (const flow of target.flows) collect(flow.request, 'target-request', `${target.name} · ${flow.name}`, sites);
    collect(target.postFlow?.request, 'target-request', `${target.name} PostFlow`, sites);

    collect(target.preFlow?.response, 'target-response', `${target.name} PreFlow`, sites);
    for (const flow of target.flows) collect(flow.response, 'target-response', `${target.name} · ${flow.name}`, sites);
    collect(target.postFlow?.response, 'target-response', `${target.name} PostFlow`, sites);
    collect(target.eventFlow?.response, 'target-response', `${target.name} EventFlow`, sites);

    collect(target.faultRules?.steps, 'fault', `${target.name} DefaultFaultRule`, sites);
    for (const rule of target.faultRules?.rules ?? []) collect(rule.steps, 'fault', `${target.name} · ${rule.name}`, sites);
  }

  collect(proxy.preFlow?.response, 'proxy-response', 'PreFlow', sites);
  for (const flow of proxy.flows) collect(flow.response, 'proxy-response', flow.name, sites);
  collect(proxy.postFlow?.response, 'proxy-response', 'PostFlow', sites);
  collect(proxy.postClientFlow?.response, 'proxy-response', 'PostClientFlow', sites);

  collect(proxy.faultRules?.steps, 'fault', 'DefaultFaultRule', sites);
  for (const rule of proxy.faultRules?.rules ?? []) collect(rule.steps, 'fault', rule.name, sites);

  const result = new Map<string, PolicyAttachment>();
  for (const policy of proxy.policies) {
    const found = sites.get(policy.name) ?? [];
    result.set(policy.name, { sites: found, group: found[0]?.group ?? 'unattached' });
  }
  return result;
}
