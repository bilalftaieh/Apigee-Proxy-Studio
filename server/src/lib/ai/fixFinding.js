// Orchestrates one repair: build context, ask the model, check the answer
// against the grammar, then check the answer against the problem it was
// supposed to solve — and give it one chance to try again if either fails.
//
// The second check is what separates this from the generation path. A generated
// policy can only be validated for shape, because there is nothing to compare it
// against. A fix has a reason for existing, and that reason is a finding we
// produced deterministically and can produce again: re-run the deploy blockers
// over a copy of the proxy with the proposed XML swapped in, and the model's
// claim to have fixed something becomes a fact we verified rather than a fact it
// asserted.
//
// The same pass answers the question the user actually worries about, which is
// not "did it fix that one line" but "what else did it change". Any blocker
// present after the edit that was not present before is reported, and is fed
// back to the model as a rejection.

import { XML_HEADER } from '../xml.js';
import { canonicalizeXml } from '../canonicalXml.js';
import { getPolicyType } from '../policyTemplates.js';
import { collectDeployBlockers } from '../deployChecks.js';
import { getElementTree } from './elementSchema.js';
import { buildFixContext } from './safeContext.js';
import { FIX_SYSTEM_INSTRUCTION, buildFixPrompt, buildFixResponseSchema } from './fixPrompt.js';
import { generateStructured } from './provider.js';
import { pseudonymize, restore } from './redact.js';
import { renderAndValidate } from './renderPolicy.js';

// One retry, for the same reason generatePolicy stops at one: if a second
// attempt with the failures spelled out still misses, further attempts burn
// quota rather than converging, and a near-miss shown in a diff is more useful
// to the user than a third round of the same answer.
const MAX_ATTEMPTS = 2;

// apigeelint findings and our own deploy blockers are both merged into the lint
// result, but only ours can be re-run cheaply — apigeelint means a subprocess
// and up to 30 seconds, which is not something to put inside a retry loop.
const RECHECKABLE_RULE = /^DEPLOY\d+$/;

// A finding's identity for set comparison. The message is part of it because a
// single rule fires many times with different subjects in one file — DEPLOY004
// on a target with no URL and DEPLOY004 on a target with a bad path are two
// different problems, and treating them as one would let a fix report success
// for a blocker it never touched.
function findingKey(finding) {
  return `${finding.filePath}|${finding.ruleId}|${finding.message}`;
}

/**
 * Whether the proposal is the policy it started from.
 *
 * The system instruction tells the model to return the policy untouched when
 * the problem cannot be solved inside it — a missing project id is not
 * something to invent — and it does. That is the right answer, but presenting
 * it behind an "Apply" button that does nothing is not: the user would accept a
 * fix, watch the finding survive, and reasonably conclude the feature is
 * broken.
 *
 * Compared canonically because the proposal has been through the renderer and
 * the original has not, so indentation and self-closing tags differ on XML that
 * is otherwise identical.
 */
function isUnchanged(before, after) {
  try {
    return canonicalizeXml(before).trim() === canonicalizeXml(after).trim();
  } catch {
    // An original this app cannot parse is not one we can call unchanged.
    return false;
  }
}

function withPolicyXml(proxy, policyName, xml) {
  return {
    ...proxy,
    policies: (proxy.policies || []).map((p) => (p.name === policyName ? { ...p, xml } : p)),
  };
}

/**
 * Re-derives the deploy blockers with the proposed XML in place.
 *
 * knownSharedFlows is deliberately not threaded through: without it
 * collectDeployBlockers skips the shared-flow reference check entirely, which is
 * the right call here. Treating "this proxy calls a shared flow Studio has not
 * seen" as a problem the fix introduced would be wrong — it was already there,
 * and it is a warning about the org rather than about this policy.
 *
 * @returns {{ recheckable: boolean, resolved: boolean|null, newProblems: string[] }}
 *   `resolved` is null when the finding is not one we can re-run, which is
 *   reported to the user as "not re-checked" rather than quietly as success.
 */
function verifyFix(proxy, policyName, fixedXml, finding) {
  const before = collectDeployBlockers(proxy);
  const after = collectDeployBlockers(withPolicyXml(proxy, policyName, fixedXml));

  const key = findingKey(finding);
  const beforeKeys = new Set(before.map(findingKey));
  const afterKeys = new Set(after.map(findingKey));

  // Re-checkable only if we can also confirm the finding was there to begin
  // with. A stale finding from an earlier lint run would otherwise be reported
  // as "resolved" by a fix that did nothing at all.
  const recheckable = RECHECKABLE_RULE.test(String(finding.ruleId || '')) && beforeKeys.has(key);

  return {
    recheckable,
    resolved: recheckable ? !afterKeys.has(key) : null,
    newProblems: after.filter((p) => !beforeKeys.has(findingKey(p))).map((p) => p.message),
  };
}

/**
 * @param {object} proxy The normalized proxy — used for context, redaction and
 *   verification. Never sent: only the one policy's XML is.
 * @param {object} policy The policy to repair: { id, name, type, xml }.
 * @param {object} finding A lint message: { filePath, ruleId, message, severity }.
 */
export async function fixFinding({ proxy, policy, finding }) {
  const type = getPolicyType(policy.type);
  if (!type) {
    throw new Error(`"${policy.type}" is not a policy type this app knows how to edit.`);
  }

  const { context, map } = buildFixContext(proxy, { policy, finding });
  const elementTree = await getElementTree(context.policyRootTag);
  const base = buildFixPrompt({ context, elementTree });
  const schema = buildFixResponseSchema();

  let prompt = base.text;
  let last = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await generateStructured({
      systemInstruction: FIX_SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: schema,
      proxy,
      staticPromptText: base.staticText,
    });

    const checked = await renderAndValidate(result, type, { policyName: policy.name });
    const errors = [...checked.errors];

    // Placeholders go back to real values before verification, not after: the
    // blockers check real things — resource paths, template tokens, URLs — and
    // `{{URL_1}}` is none of them. Verifying the pseudonymized text would report
    // problems that do not exist in what the user would actually receive.
    const xml = restore(XML_HEADER + (checked.ok ? checked.canonical : checked.xml), map);

    let verification = null;
    if (checked.ok) {
      verification = verifyFix(proxy, policy.name, xml, finding);

      if (verification.resolved === false) {
        errors.push({
          // context.problem, not finding.message: the pseudonymized copy is the
          // only one allowed back into a prompt.
          message: `The reported problem is still present after your change: ${context.problem}`,
        });
      }
      for (const problem of verification.newProblems) {
        errors.push({
          message: `Your change introduced a new problem: ${pseudonymize(problem, map)}`,
        });
      }
    }

    if (!errors.length) {
      return {
        ok: true,
        policyId: policy.id,
        policyName: policy.name,
        policyType: type.key,
        original: policy.xml,
        xml,
        notes: restore(result.notes || '', map),
        attempts: attempt,
        unchanged: isUnchanged(policy.xml, xml),
        warnings: [],
        verification,
      };
    }

    last = { xml, notes: result.notes, errors, verification };

    prompt = [
      base.text,
      '',
      'Your previous answer was rejected:',
      ...errors.map((e) => `- ${e.message}`),
      '',
      'Produce a corrected policy. Use only elements from the grammar above, and still change',
      'nothing that the reported problem does not require.',
    ].join('\n');
  }

  // Both attempts fell short. The draft comes back anyway, clearly marked and
  // diffed against the original — a near-miss the user can see and adjust beats
  // an error message, and the accept button is theirs not to press.
  return {
    ok: false,
    policyId: policy.id,
    policyName: policy.name,
    policyType: type.key,
    original: policy.xml,
    xml: last?.xml || '',
    notes: restore(last?.notes || '', map),
    attempts: MAX_ATTEMPTS,
    unchanged: last ? isUnchanged(policy.xml, last.xml) : false,
    warnings: (last?.errors || []).map((e) => restore(e.message, map)),
    verification: last?.verification || null,
  };
}

/** What fixFinding would send, without sending it. Mirrors previewRequest. */
export async function previewFixRequest({ proxy, policy, finding }) {
  const { context, map } = buildFixContext(proxy, { policy, finding });
  const elementTree = await getElementTree(context.policyRootTag);
  const { text } = buildFixPrompt({ context, elementTree });

  return {
    systemInstruction: FIX_SYSTEM_INSTRUCTION,
    prompt: text,
    substitutions: [...map.reverse.keys()].map((token) => ({
      placeholder: token,
      characters: map.reverse.get(token).length,
    })),
  };
}
