// Runs a saved/ad-hoc test case against a proxy's in-memory model — the same
// tree bundleGenerator.js walks to produce XML, except this walks it to
// *execute* it. No network call ever happens: the target backend is replaced
// by whatever response the test case supplies (`mockTargetResponse`).
//
// Pipeline (mirrors real Apigee request/response processing order):
//   proxy.preFlow.request -> matched proxy.flows[].request -> RouteRules
//   -> target.preFlow.request -> matched target.flows[].request -> target.postFlow.request
//   -> [mock backend]
//   -> target.preFlow.response -> matched target.flows[].response -> target.postFlow.response
//   -> matched proxy.flows[].response -> proxy.postFlow.response
// A FaultError raised anywhere jumps to the current scope's FaultRules
// (target's if the fault happened while scope === 'target', else proxy's).
import { evaluateCondition } from './conditionEvaluator.js';
import { createContext, createMessage, getVariable, listHeaders, FaultError } from './testContext.js';
import { executePolicy } from './policyExecutors.js';

function resolveVarFor(ctx) {
  return (name) => getVariable(ctx, name);
}

function runFlowSteps(steps, ctx, trace, phaseLabel, policiesByName) {
  for (const step of steps || []) {
    const cond = evaluateCondition(step.condition, resolveVarFor(ctx));
    if (!cond.result) {
      trace.push({ phase: phaseLabel, policyName: step.policyName, skipped: true, condition: step.condition || undefined, unsupportedCondition: cond.unsupported || undefined });
      continue;
    }

    const policy = policiesByName.get(step.policyName);
    if (!policy) {
      trace.push({ phase: phaseLabel, policyName: step.policyName, error: 'Referenced policy not found in this proxy' });
      continue;
    }

    const variablesBefore = { ...ctx.variables };
    const startedAt = Date.now();
    let result;
    try {
      result = executePolicy(policy, ctx);
    } catch (err) {
      // A FaultError thrown from inside a policy (e.g. a JS policy throwing)
      // would otherwise skip this step's trace entry entirely, leaving only
      // the generic fault-phase entry from handleFault — push one here first
      // so the error (and any output logged before it) is attributed to the
      // exact step that raised it, then let it propagate to fault handling.
      trace.push({
        phase: phaseLabel,
        policyName: policy.name,
        policyType: policy.type,
        error: err instanceof FaultError ? err.fault.message : err.message,
        notes: err instanceof FaultError ? err.fault.logs : undefined,
        durationMs: Date.now() - startedAt,
        variablesBefore,
        variablesAfter: { ...ctx.variables },
      });
      throw err;
    }
    trace.push({
      phase: phaseLabel,
      policyName: policy.name,
      policyType: result.policyTag,
      emulated: result.emulated,
      skipped: result.skipped || undefined,
      notes: result.notes,
      durationMs: Date.now() - startedAt,
      variablesBefore,
      variablesAfter: { ...ctx.variables },
    });
  }
}

// A flow toggled off (Flow.enabled === false) doesn't exist in the exported
// bundle at all — skipped here too, with no trace entry, so a simulated run
// matches what a real deploy would actually do.
function matchConditionalFlow(flows, ctx, trace, phaseLabel) {
  for (const flow of flows || []) {
    if (flow.enabled === false) continue;
    const cond = evaluateCondition(flow.condition, resolveVarFor(ctx));
    trace.push({ phase: phaseLabel, evaluatingFlow: flow.name, condition: flow.condition || undefined, matched: cond.result, unsupportedCondition: cond.unsupported || undefined });
    if (cond.result) return flow;
  }
  return null;
}

// Mirrors matchFlow, but for <FaultRule>s: the first rule whose condition is
// true wins and evaluation stops there — Apigee does not run every matching
// rule, and it does not fall through to the DefaultFaultRule afterwards. A
// rule with a blank condition always matches. Returns null when nothing
// matched, which is the DefaultFaultRule's cue to run.
function matchFaultRule(rules, ctx, trace) {
  for (const rule of rules || []) {
    const cond = evaluateCondition(rule.condition, resolveVarFor(ctx));
    trace.push({ phase: 'faultRules', evaluatingFaultRule: rule.name, condition: rule.condition || undefined, matched: cond.result, unsupportedCondition: cond.unsupported || undefined });
    if (cond.result) return rule;
  }
  return null;
}

function matchRoute(routeRules, ctx, trace) {
  for (const rr of routeRules || []) {
    const cond = evaluateCondition(rr.condition, resolveVarFor(ctx));
    trace.push({ phase: 'route', evaluatingRule: rr.name, condition: rr.condition || undefined, matched: cond.result, unsupportedCondition: cond.unsupported || undefined });
    if (cond.result) return rr;
  }
  return null;
}

function finalizeMessage(msg) {
  if (!msg) return null;
  return { status: msg.status, reasonPhrase: msg.reasonPhrase, headers: listHeaders(msg), content: msg.content };
}

// Runs the current scope's FaultRules (target's if the fault fired while in
// the target's flow, otherwise the proxy's), then builds the client-visible
// fault response. A fault raised while a FaultRule step itself runs aborts
// fault handling — mirrors Apigee not looping through fault handling twice.
function handleFault(fault, ctx, proxy, target, trace, policiesByName) {
  trace.push({ phase: 'fault', message: fault.message, status: fault.status });

  ctx.response = createMessage({ status: fault.status ?? 500, reasonPhrase: fault.reasonPhrase, headers: fault.headers || {}, content: fault.payload ?? '' });
  ctx.phase = 'response';

  const faultRules = ctx.scope === 'target' && target ? target.faultRules : proxy.faultRules;

  // Apigee populates the error.* variables before fault handling starts, and a
  // FaultRule condition is nearly always written against one of them
  // (error.message most of all). They have to be readable before any condition
  // is evaluated — getVariable falls through to ctx.variables for names it
  // doesn't special-case, so assigning them here is enough.
  ctx.variables['error.message'] = fault.message ?? '';
  ctx.variables['error.status.code'] = fault.status ?? 500;
  ctx.variables['error.reason.phrase'] = fault.reasonPhrase ?? '';
  ctx.variables['error.content'] = fault.payload ?? '';

  const matched = matchFaultRule(faultRules?.rules, ctx, trace);
  try {
    if (matched) {
      runFlowSteps(matched.steps, ctx, trace, `faultRules[${matched.name}]`, policiesByName);
    } else if (faultRules?.steps?.length) {
      runFlowSteps(faultRules.steps, ctx, trace, 'faultRules', policiesByName);
    }
  } catch (err) {
    if (!(err instanceof FaultError)) throw err;
    trace.push({ phase: 'fault', message: `Fault raised while handling fault: ${err.fault.message}` });
  }
}

export function runProxyTest(proxy, test) {
  const trace = [];
  const policiesByName = new Map((proxy.policies || []).map((p) => [p.name, p]));

  const request = createMessage({
    verb: test.request?.verb || 'GET',
    pathSuffix: test.request?.pathSuffix || '/',
    headers: test.request?.headers || {},
    queryParams: test.request?.queryParams || {},
    content: test.request?.body || '',
  });
  const ctx = createContext({ proxy, request, initialState: test.initialState });

  let fault = null;
  let matchedFlow = null;
  let matchedTargetFlow = null;
  let target = null;

  try {
    runFlowSteps(proxy.preFlow?.request, ctx, trace, 'proxy.preFlow.request', policiesByName);

    matchedFlow = matchConditionalFlow(proxy.flows, ctx, trace, 'proxy.flows');
    if (matchedFlow) runFlowSteps(matchedFlow.request, ctx, trace, `proxy.flows[${matchedFlow.name}].request`, policiesByName);

    const route = matchRoute(proxy.routeRules, ctx, trace);
    if (!route) throw new FaultError({ message: 'No RouteRule matched this request — proxy has no route to a target', status: 404 });
    target = (proxy.targets || []).find((t) => t.name === route.targetName);
    if (!target) throw new FaultError({ message: `RouteRule "${route.name}" points to unknown target "${route.targetName}"`, status: 404 });

    ctx.scope = 'target';
    runFlowSteps(target.preFlow?.request, ctx, trace, 'target.preFlow.request', policiesByName);
    matchedTargetFlow = matchConditionalFlow(target.flows, ctx, trace, 'target.flows');
    if (matchedTargetFlow) runFlowSteps(matchedTargetFlow.request, ctx, trace, `target.flows[${matchedTargetFlow.name}].request`, policiesByName);
    runFlowSteps(target.postFlow?.request, ctx, trace, 'target.postFlow.request', policiesByName);

    ctx.response = createMessage({
      status: test.mockTargetResponse?.status ?? 200,
      headers: test.mockTargetResponse?.headers || {},
      content: test.mockTargetResponse?.body ?? '',
    });
    ctx.phase = 'response';
    trace.push({ phase: 'mockBackend', response: finalizeMessage(ctx.response) });

    runFlowSteps(target.preFlow?.response, ctx, trace, 'target.preFlow.response', policiesByName);
    if (matchedTargetFlow) runFlowSteps(matchedTargetFlow.response, ctx, trace, `target.flows[${matchedTargetFlow.name}].response`, policiesByName);
    runFlowSteps(target.postFlow?.response, ctx, trace, 'target.postFlow.response', policiesByName);

    ctx.scope = 'proxy';
    if (matchedFlow) runFlowSteps(matchedFlow.response, ctx, trace, `proxy.flows[${matchedFlow.name}].response`, policiesByName);
    runFlowSteps(proxy.postFlow?.response, ctx, trace, 'proxy.postFlow.response', policiesByName);
  } catch (err) {
    if (!(err instanceof FaultError)) throw err;
    fault = err.fault;
    handleFault(err.fault, ctx, proxy, target, trace, policiesByName);
  }

  const notEmulated = [...new Set(trace.filter((t) => t.emulated === false).map((t) => t.policyName))];

  return {
    trace,
    notEmulated,
    request: finalizeMessage(ctx.request),
    response: finalizeMessage(ctx.response),
    fault,
    matchedFlow: matchedFlow?.name || null,
    matchedTargetFlow: matchedTargetFlow?.name || null,
    routedTo: target?.name || null,
    variables: { ...ctx.variables },
  };
}
