// What we ask for when reviewing a whole proxy, and how the answer is shaped.
//
// The brief matters more here than in either other AI feature. Generation and
// repair both have an objective test at the end — the grammar, the blockers —
// so a vague brief costs quality. A review has no such test: the model's output
// IS the product, and a reviewer that lists everything it can think of is worse
// than useless, because the real findings drown in the filler. Most of the
// system instruction below is therefore about what NOT to say.

// Section headings, kept as constants because the leak guard has to be able to
// subtract them. A TargetServer named "Execution" is unremarkable in a real
// workspace, and without this the guard would find that word in our own heading
// and abort the request claiming a leak — the one failure mode guaranteed to
// get a fail-closed guard switched off. See subtractStaticText in guard.js.
export const SECTION_HEADINGS = [
  'Policies in this proxy (name, type, and configuration):',
  'Execution order — every step, in the order Apigee runs it:',
  'Conditional flows:',
  'Route rules:',
  'Target endpoints:',
  'ProxyEndpoint fault handling:',
  'PostClientFlow steps:',
  'Policies whose XML was omitted to keep this request a reasonable size:',
];

export const REVIEW_SYSTEM_INSTRUCTION = [
  'You review Apigee X API proxy designs. You are given the full structure of one proxy:',
  'its policies, and every step in the order Apigee runs them. Report design problems.',
  '',
  'What to report — problems that are invisible to a schema check but real at runtime:',
  '- Ordering: a policy that runs too late to do its job. A quota or spike arrest placed',
  '  after the backend call has already been made. An authentication or verification step',
  '  that runs after the work it was supposed to gate.',
  '- Gaps: a request path with no authentication at all. A proxy that accepts a body with',
  '  no threat protection. A target with no fault handling, so backend failures reach the',
  '  caller as raw Apigee errors.',
  '- Isolation: a cache key that does not separate one caller from another, so one',
  '  developer app can be served another\'s response.',
  '- Exposure: a policy that logs or copies a header carrying a token or credential. A',
  '  backend leg configured to ignore TLS validation errors.',
  '- Conditions: a conditional flow or fault rule that can never match, or one placed',
  '  after a rule that always matches and therefore never runs.',
  '',
  'What NOT to report — a linter already covers all of this, and repeating it is noise:',
  '- Missing, misspelled or invalid elements and attributes; anything about XML validity.',
  '- Policies not attached to any step, steps naming policies that do not exist,',
  '  missing resource files, unreplaced {PLACEHOLDER} tokens, naming conventions.',
  '- Style preferences, or a DisplayName that differs from a filename.',
  '',
  'Rules:',
  '- Every finding must name at least one policy from the list you were given, spelled',
  '  exactly as given. If you cannot tie a problem to a specific policy, do not report it.',
  '- Report what you can see. You are shown the proxy\'s structure, not its traffic, its',
  '  backends or its environment — do not assume facts about any of them.',
  '- Values that look like {{URL_1}} or {{TARGETSERVER_1}} are placeholders for withheld',
  '  values. Treat each as an opaque literal. Never guess what one stands for.',
  '- Prefer a few findings that are certainly true to many that might be. Six real',
  '  problems is a good review; twenty speculative ones is a bad one.',
  '- If the design is sound, return no findings and say so in the summary. That is a',
  '  valid and useful answer, not a failure.',
].join('\n');

const SEVERITIES = ['high', 'medium', 'low'];
const CATEGORIES = ['security', 'traffic-management', 'error-handling', 'performance', 'correctness'];
const FIX_KINDS = ['policy', 'flow', 'none'];

export function buildReviewResponseSchema() {
  const finding = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'One short line naming the problem. No markdown.' },
      severity: { type: 'STRING', enum: SEVERITIES, description: 'How much it matters in production.' },
      category: { type: 'STRING', enum: CATEGORIES },
      detail: {
        type: 'STRING',
        description: 'What is wrong and what happens at runtime because of it. Two or three sentences.',
      },
      recommendation: { type: 'STRING', description: 'What to change. One or two sentences.' },
      policyNames: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Policies this is about, spelled exactly as given. At least one.',
      },
      where: { type: 'STRING', description: 'The flow position this concerns, as given in the execution order.' },
      fixKind: {
        type: 'STRING',
        enum: FIX_KINDS,
        description:
          "'policy' if editing the named policy's own XML resolves it; 'flow' if a step has to move, " +
          "be added or be removed; 'none' if it needs something outside this proxy.",
      },
    },
    required: ['title', 'severity', 'category', 'detail', 'recommendation', 'policyNames', 'fixKind'],
  };

  const required = ['summary', 'findings'];
  return {
    type: 'OBJECT',
    properties: {
      summary: {
        type: 'STRING',
        description: 'One or two sentences on the proxy overall. Plain language, no markdown.',
      },
      findings: { type: 'ARRAY', items: finding },
    },
    required,
    propertyOrdering: required,
  };
}

export const SEVERITY_VALUES = SEVERITIES;
export const CATEGORY_VALUES = CATEGORIES;
export const FIX_KIND_VALUES = FIX_KINDS;

function renderPolicies(policies) {
  return policies.map((p) => {
    const head = `- ${p.name} (${p.type})`;
    if (!p.xml) return head;
    return `${head}\n${p.xml}`;
  });
}

function renderExecution(execution) {
  if (!execution.length) return ['(no steps — this proxy runs no policies at all)'];
  return execution.map(
    (s, i) =>
      `${String(i + 1).padStart(3)}. [${s.where}] ${s.policy} (${s.type})` +
      (s.condition ? `  when: ${s.condition}` : '')
  );
}

function renderFaultHandling(fh) {
  const lines = [];
  for (const rule of fh.rules) {
    lines.push(
      `- FaultRule "${rule.name}"${rule.condition ? ` when: ${rule.condition}` : ' (no condition — always matches)'}` +
        `: ${rule.steps.join(', ') || 'no steps'}`
    );
  }
  lines.push(
    fh.defaultRuleSteps.length
      ? `- DefaultFaultRule: ${fh.defaultRuleSteps.join(', ')}`
      : '- DefaultFaultRule: none'
  );
  return lines;
}

/**
 * @returns {{ text: string, staticChunks: string[] }} The headings are handed
 *   back separately rather than as one trailing block, because unlike the other
 *   two prompts this one has no contiguous static half — the scaffolding is
 *   interleaved with the workspace's own content all the way down.
 */
export function buildReviewPrompt({ context }) {
  const parts = [];
  const [
    policiesHeading,
    executionHeading,
    flowsHeading,
    routeRulesHeading,
    targetsHeading,
    faultHeading,
    postClientHeading,
    omittedHeading,
  ] = SECTION_HEADINGS;

  parts.push(policiesHeading);
  parts.push(...renderPolicies(context.policies));
  parts.push('');

  if (context.policiesWithoutXml.length) {
    parts.push(omittedHeading);
    parts.push(context.policiesWithoutXml.join(', '));
    parts.push('');
  }

  parts.push(executionHeading);
  parts.push(...renderExecution(context.execution));
  parts.push('');

  if (context.flows.length) {
    parts.push(flowsHeading);
    for (const f of context.flows) {
      parts.push(`- ${f.name}${f.disabled ? ' (disabled)' : ''}: ${f.condition || '(no condition)'}`);
    }
    parts.push('');
  }

  parts.push(routeRulesHeading);
  for (const r of context.routeRules) {
    parts.push(
      `- ${r.name} → ${r.mode === 'target' ? r.target || '(none)' : r.mode}` +
        (r.condition ? `  when: ${r.condition}` : '  (no condition — always matches)')
    );
  }
  parts.push('');

  parts.push(targetsHeading);
  for (const t of context.targets) {
    const bits = [`mode: ${t.mode}`];
    if (t.hasPath) bits.push('has a Path override');
    if (t.tls) {
      bits.push(`TLS configured${t.tls.clientAuth ? ' with client auth' : ''}`);
      if (t.tls.ignoresValidationErrors) bits.push('IGNORES TLS validation errors');
    }
    if (t.googleAuth) bits.push(`Google auth: ${t.googleAuth}`);
    if (t.hasEventFlow) bits.push('has a streaming EventFlow');
    parts.push(`- ${t.name} (${bits.join('; ')})`);
    parts.push(...renderFaultHandling(t.faultHandling).map((l) => `  ${l}`));
  }
  parts.push('');

  parts.push(faultHeading);
  parts.push(...renderFaultHandling(context.proxyFaultHandling));
  parts.push('');

  parts.push(postClientHeading);
  parts.push(context.postClientFlowSteps.join(', ') || '(none)');

  return { text: parts.join('\n'), staticChunks: SECTION_HEADINGS };
}
