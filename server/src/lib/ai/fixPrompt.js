// What we ask the model when a policy already exists and something is wrong
// with it.
//
// Same trick as policyPrompt.js: the model never writes XML. It fills in the
// same structured object, and renderPolicyXml turns that into the document. The
// difference here is the brief — a fix is judged on being MINIMAL, so most of
// the instruction below is about what not to touch.

import { buildResponseSchema } from './policyPrompt.js';
import { outlineTree } from './elementSchema.js';

// The index in `parts` below where workspace-derived content stops and this
// repo's own constants begin. Everything from here on is the scraped grammar
// and our static policy catalogue, which is what lets the leak guard subtract
// it before searching — see buildPolicyPrompt's note on staticText.
const STATIC_FROM = 6;

export const FIX_SYSTEM_INSTRUCTION = [
  'You repair Apigee X API proxy policies. You are given one policy and one problem',
  'reported against it by a linter. Return the corrected policy.',
  '',
  'Rules:',
  '- Fix ONLY the reported problem. Copy every other element, attribute and value',
  '  through unchanged, exactly as it appears in the current policy. A fix that',
  '  rewrites unrelated configuration is a worse answer than no fix at all.',
  '- Do not change the policy name. Steps elsewhere in the proxy reference it, and',
  '  renaming it would break them.',
  '- Use ONLY element and attribute names that appear in the grammar you are given.',
  '  If the grammar does not contain an element, it does not exist — do not invent one.',
  '- Values that look like {{URL_1}}, {{KVM_1}} or {{TARGETSERVER_1}} are placeholders for real',
  '  values that were withheld. Treat each as an opaque literal: reuse it exactly as written',
  '  wherever it belongs. Never guess what it stands for, and never invent new placeholders.',
  '- If the problem cannot be fixed inside this policy alone — because it needs a',
  '  file, a target or a setting that lives elsewhere — return the policy unchanged',
  '  and say so plainly in notes. Do not invent a value to make the message go away.',
].join('\n');

export function buildFixResponseSchema() {
  return buildResponseSchema({
    includeName: false,
    notesDescription:
      'One or two sentences for the user: what you changed and why it resolves the reported ' +
      'problem. If you could not fix it inside this policy, say what they need to do instead. ' +
      'Plain language, no markdown.',
  });
}

/** @returns {{ text: string, staticText: string }} — see buildPolicyPrompt. */
export function buildFixPrompt({ context, elementTree }) {
  const parts = [];

  // Workspace-derived content, first and contiguous so `staticText` below can be
  // a single trailing substring.
  parts.push(
    `Problem reported${context.ruleId ? ` by rule ${context.ruleId}` : ''}: ${context.problem}`
  );
  parts.push('');
  parts.push(`Policy name (keep it exactly as it is): ${context.policyName}`);
  parts.push('Current policy XML:');
  parts.push((context.currentXml || '').trim());
  parts.push('');

  // --- everything below is this repo's own constants ---
  parts.push(
    `Policy type: ${context.policyType} — ${context.policyLabel} (${context.policyCategory})`
  );
  parts.push(`Root element: <${context.policyRootTag}>`);
  parts.push('');

  if (elementTree) {
    parts.push(`Grammar for <${context.policyRootTag}> (indentation shows nesting):`);
    parts.push(outlineTree(elementTree));
    parts.push('');
  }

  parts.push('Flow variables available in this proxy:');
  parts.push(context.commonFlowVariables.join(', '));

  return { text: parts.join('\n'), staticText: parts.slice(STATIC_FROM).join('\n') };
}
