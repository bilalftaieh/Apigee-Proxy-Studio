// Turns one model answer into checked policy XML.
//
// Both AI features — generating a new policy and fixing an existing one — get
// back the same structured element object, so both need the same three steps in
// the same order: render it, check every name was writable, validate the result
// against the scraped grammar. Sharing them is what keeps a fix held to exactly
// the standard a generation is held to, rather than to a second opinion that
// drifts.

import { invalidXmlNames, renderPolicyXml } from './policyPrompt.js';
import { validatePolicyXml } from './validatePolicyXml.js';

/**
 * @param {object} result The model's structured answer.
 * @param {object} type A POLICY_TYPES entry.
 * @param {string|null} policyName Overrides the name in `result`. The fix path
 *   passes the existing name: a policy renamed underneath its Steps is a
 *   dangling reference, which is a worse bug than the one being fixed.
 * @returns {{ ok, xml, canonical, rootTag, errors }} `xml` is what was rendered
 *   (always well-formed — the renderer drops names it cannot write); `canonical`
 *   is the tidied version, and is only meaningful when `ok`.
 */
export async function renderAndValidate(result, type, { policyName = null } = {}) {
  const rootTag = type.xmlTag || type.key;
  const name = policyName ?? result.policyName;
  const xml = renderPolicyXml({ ...result, policyName: name }, rootTag);
  const check = await validatePolicyXml(xml, { expectedRootTag: rootTag, policyName: name });

  // The renderer drops names it cannot write, so `xml` is well-formed either
  // way — but a policy quietly missing an element is worse than one that says
  // so. Raised as a validation error, which both feeds the retry and surfaces
  // in `warnings` if the retry also fails.
  const unwritable = invalidXmlNames(result);
  const errors = unwritable.length
    ? [
        {
          message:
            `These are not usable XML names and were left out: ${unwritable.join(', ')}. ` +
            `Use element and attribute names exactly as the grammar spells them.`,
        },
        ...check.errors,
      ]
    : check.errors;

  return { ok: check.ok && !unwritable.length, xml, canonical: check.xml, rootTag, errors };
}
