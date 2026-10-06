import type { Template, Flow, Step } from '../types/proxy';

/**
 * What a template would contribute on top of an imported API surface.
 *
 * Counted on the client from the template the store already holds, so the
 * import dialog can say "adds 5 policies, 4 flow steps" before anything is
 * sent — there is nothing to merge against yet, and a round-trip for a number
 * the user is about to change by picking a different template would just make
 * the picker feel slow.
 *
 * It is therefore a *ceiling*, not a promise: the server's merge drops
 * anything that collides with what the artifact already brought, and reports
 * what it actually added. Word the caller's UI accordingly ("adds up to ...").
 */
export interface TemplateContribution {
  policies: number;
  flowSteps: number;
  flows: number;
  faultRules: number;
}

function countSteps(...lists: (Step[] | undefined)[]): number {
  return lists.reduce((n, list) => n + (list?.length || 0), 0);
}

export function summarizeTemplate(template: Template): TemplateContribution {
  const p = template.proxy;
  const targetSteps = (p.targets || []).reduce(
    (n, t) => n + countSteps(t.preFlow?.request, t.preFlow?.response, t.postFlow?.request, t.postFlow?.response),
    0
  );
  return {
    policies: p.policies?.length || 0,
    flowSteps:
      countSteps(p.preFlow?.request, p.preFlow?.response, p.postFlow?.request, p.postFlow?.response, p.postClientFlow?.response) +
      targetSteps,
    flows: (p.flows as Flow[] | undefined)?.length || 0,
    faultRules: (p.faultRules?.rules?.length || 0) + (p.faultRules?.steps?.length || 0),
  };
}

/** "5 policies, 4 flow steps, 1 fault rule" — empty string if it adds nothing. */
export function describeContribution(c: TemplateContribution): string {
  return (
    [
      [c.policies, 'policy', 'policies'],
      [c.flowSteps, 'flow step', 'flow steps'],
      [c.flows, 'conditional flow', 'conditional flows'],
      [c.faultRules, 'fault rule', 'fault rules'],
    ] as [number, string, string][]
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(', ');
}
