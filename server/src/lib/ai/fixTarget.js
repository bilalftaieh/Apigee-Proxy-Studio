// Which lint findings the AI fixer is allowed to take on.
//
// The answer is narrow on purpose: a finding is fixable only when it belongs to
// exactly one policy XML file that exists in this proxy. That is not a
// limitation of the model, it is what makes the feature safe to offer —
//
//   * the edit has one well-defined target, so "accept" means replacing one
//     policy's XML rather than reshaping the workspace;
//   * the result can be put through validatePolicyXml, which only knows how to
//     judge a policy document;
//   * the retry loop has something concrete to re-check.
//
// The findings this excludes — an empty base path, a route rule with no target,
// an invalid proxy name — are edits to the proxy MODEL, not to XML. Those are
// single-click fixes on the tabs that own those fields, and routing them
// through a language model would be slower and less certain than the form the
// user already has.

const POLICY_FILE_RE = /^apiproxy\/policies\/(.+)\.xml$/;

// Findings that name a policy file but whose remedy is not in that file.
//
// Both of these say the policy is not attached to any Step. No edit to the
// policy's own XML can resolve that — the missing thing is a Step in a flow —
// so offering a fix here would spend a request to be told, correctly, that the
// policy came back unchanged. The Flow Diagram and Proxy Endpoint tabs are
// where this one gets fixed.
//
// Mirrored in client/src/lib/aiFix.ts, which decides whether to draw the
// button. Keep the two in step.
const STRUCTURAL_RULES = new Set([
  'DEPLOY007', // ours: "isn't referenced by any Step"
  'BN005', // apigeelint: "is not attached to a Step in the bundle"
]);

/** Whether the finding's remedy lives outside the policy XML. */
export function isStructuralFinding(finding) {
  return STRUCTURAL_RULES.has(String(finding?.ruleId || ''));
}

/** The policy name a bundle-relative lint filePath refers to, or null. */
export function policyNameFromFilePath(filePath) {
  const match = POLICY_FILE_RE.exec(String(filePath || '').replace(/\\/g, '/'));
  return match ? match[1] : null;
}

/**
 * The policy a finding is about, or null when it is not about one policy.
 * Callers must treat null as "not fixable" rather than falling back to a guess.
 */
export function resolveFixTarget(proxy, finding) {
  if (isStructuralFinding(finding)) return null;
  const name = policyNameFromFilePath(finding?.filePath);
  if (!name) return null;
  return (proxy?.policies || []).find((p) => p.name === name) || null;
}
