// Orchestrates one review, and then throws most of it away.
//
// The other two AI features end in a test the answer either passes or fails —
// the grammar for a generated policy, the deploy blockers for a fix. A review
// has no such test. Its output is prose, and prose about a design cannot be
// mechanically confirmed.
//
// What CAN be confirmed is whether a finding is about something that exists.
// That turns out to catch most of what goes wrong: a review that has drifted
// from the proxy in front of it drifts by inventing — a policy that is not
// there, a step in a flow that does not run it. So every finding is checked
// against the real policy list, and anything naming something absent is
// dropped before the user ever sees it, with one retry that tells the model
// which names were wrong.
//
// This is a filter, not a proof. A finding that survives is about real policies;
// it is not thereby correct. The UI says so, and these findings never touch the
// export gate.

import { getPolicyType } from '../policyTemplates.js';
import { buildReviewContext } from './reviewContext.js';
import {
  CATEGORY_VALUES,
  FIX_KIND_VALUES,
  REVIEW_SYSTEM_INSTRUCTION,
  SEVERITY_VALUES,
  buildReviewPrompt,
  buildReviewResponseSchema,
} from './reviewPrompt.js';
import { generateStructured } from './provider.js';
import { restore } from './redact.js';

const MAX_ATTEMPTS = 2;

// A reviewer that returns thirty items has not reviewed anything; it has
// listed. The cap is applied after grounding and after sorting by severity, so
// what survives is the most serious of what was real.
const MAX_FINDINGS = 12;

// Retry only when grounding threw away enough to suggest the model was not
// working from the proxy it was given. One bad name out of eight is a typo
// worth dropping silently; five out of eight is a review worth asking for again.
const RETRY_DROP_RATIO = 0.4;

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

function clamp(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Keeps the findings that are about policies this proxy actually has.
 *
 * Matching is exact. A near-miss is not repaired into the closest real name:
 * "did you mean" guessing would turn a finding about a policy that does not
 * exist into a confident finding about one that does, which is the worst
 * possible repair.
 *
 * @returns {{ kept: object[], droppedNames: string[] }}
 */
function groundFindings(findings, proxy) {
  const realNames = new Set((proxy.policies || []).map((p) => p.name));
  const byName = new Map((proxy.policies || []).map((p) => [p.name, p]));
  const kept = [];
  const droppedNames = [];
  const seenTitles = new Set();

  for (const raw of findings || []) {
    const title = String(raw?.title || '').trim();
    const detail = String(raw?.detail || '').trim();
    const recommendation = String(raw?.recommendation || '').trim();
    // A finding with no title or no substance is not a finding.
    if (!title || !detail || !recommendation) continue;

    const names = (raw.policyNames || []).map((n) => String(n).trim()).filter(Boolean);
    const unknown = names.filter((n) => !realNames.has(n));
    if (unknown.length || !names.length) {
      droppedNames.push(...(unknown.length ? unknown : ['(no policy named)']));
      continue;
    }

    // The same problem stated twice is one problem.
    const key = title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);

    const fixKind = clamp(raw.fixKind, FIX_KIND_VALUES, 'none');
    kept.push({
      title,
      severity: clamp(raw.severity, SEVERITY_VALUES, 'medium'),
      category: clamp(raw.category, CATEGORY_VALUES, 'correctness'),
      detail,
      recommendation,
      where: String(raw.where || '').trim(),
      fixKind,
      // Resolved here rather than in the client so the UI can offer a jump
      // without re-deriving what the server already established is real.
      policies: names.map((name) => {
        const policy = byName.get(name);
        return { id: policy.id, name, type: policy.type, label: getPolicyType(policy.type)?.label || policy.type };
      }),
    });
  }

  kept.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return { kept: kept.slice(0, MAX_FINDINGS), droppedNames: [...new Set(droppedNames)] };
}

/** Puts real values back into every string the model wrote. */
function restoreResult(result, map) {
  return {
    summary: restore(result?.summary || '', map),
    findings: (result?.findings || []).map((f) => ({
      ...f,
      title: restore(f?.title || '', map),
      detail: restore(f?.detail || '', map),
      recommendation: restore(f?.recommendation || '', map),
      where: restore(f?.where || '', map),
      policyNames: (f?.policyNames || []).map((n) => restore(String(n), map)),
    })),
  };
}

/**
 * @param {object} proxy The normalized proxy.
 * @returns {Promise<{summary, findings, attempts, dropped, policiesWithoutXml}>}
 *   `dropped` is the count of findings thrown out for naming something that is
 *   not in this proxy. It is reported rather than hidden: a review that had to
 *   discard half its own output is one to trust less, and the user is the right
 *   person to decide that.
 */
export async function reviewProxy({ proxy }) {
  const { context, map } = buildReviewContext(proxy);
  const base = buildReviewPrompt({ context });
  const schema = buildReviewResponseSchema();

  let prompt = base.text;
  let last = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await generateStructured({
      systemInstruction: REVIEW_SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: schema,
      proxy,
      staticPromptText: base.staticChunks,
    });

    // Restored before grounding: the names being compared against this proxy's
    // real policies have to be the real names, not the pseudonymized ones the
    // model was shown.
    const result = restoreResult(raw, map);
    const { kept, droppedNames } = groundFindings(result.findings, proxy);
    const total = result.findings.length;
    const dropped = total - kept.length;

    const droppedTooMuch = total > 0 && dropped / total > RETRY_DROP_RATIO;
    if (!droppedTooMuch || attempt === MAX_ATTEMPTS) {
      return {
        summary: result.summary,
        findings: kept,
        attempts: attempt,
        dropped,
        policiesWithoutXml: context.policiesWithoutXml,
      };
    }

    last = { result, kept };
    prompt = [
      base.text,
      '',
      'Your previous answer named policies that do not exist in this proxy:',
      ...droppedNames.map((n) => `- ${n}`),
      '',
      'Review it again. Every finding must name at least one policy from the list above,',
      'spelled exactly as it appears there. Drop any finding you cannot tie to one.',
    ].join('\n');
  }

  // Unreachable — the loop returns on its final attempt — but a fallback beats
  // an undefined if MAX_ATTEMPTS is ever changed without re-reading the loop.
  return {
    summary: last?.result?.summary || '',
    findings: last?.kept || [],
    attempts: MAX_ATTEMPTS,
    dropped: 0,
    policiesWithoutXml: context.policiesWithoutXml,
  };
}

/** What reviewProxy would send, without sending it. Mirrors previewRequest. */
export function previewReviewRequest({ proxy }) {
  const { context, map } = buildReviewContext(proxy);
  const { text } = buildReviewPrompt({ context });

  return {
    systemInstruction: REVIEW_SYSTEM_INSTRUCTION,
    prompt: text,
    substitutions: [...map.reverse.keys()].map((token) => ({
      placeholder: token,
      characters: map.reverse.get(token).length,
    })),
  };
}
