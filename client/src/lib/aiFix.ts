import type { LintMessage, Policy, Proxy } from '../types/proxy';

/**
 * Whether the Lint tab should offer "Fix with AI" for a finding.
 *
 * This deliberately mirrors resolveFixTarget on the server rather than asking
 * it: the tab renders dozens of findings and a round trip per row to decide
 * whether to draw a button would be absurd. The server re-resolves the target
 * independently on every request and is the authority — this only decides
 * whether a button appears, never what gets rewritten.
 *
 * A finding is fixable only when it belongs to exactly one policy file that
 * exists here. Everything else — a missing base path, a route rule with no
 * target — is an edit to the proxy model, which the tab that owns that field
 * already does in one click and far more reliably.
 */
const POLICY_FILE_RE = /^apiproxy\/policies\/(.+)\.xml$/;

/**
 * Findings that name a policy file but whose remedy is not in that file — both
 * of these mean the policy is not attached to any Step, which is a flow edit and
 * no amount of rewriting the XML will resolve it. Mirrors STRUCTURAL_RULES in
 * server/src/lib/ai/fixTarget.js; keep the two in step.
 */
const STRUCTURAL_RULES = new Set(['DEPLOY007', 'BN005']);

export function findFixablePolicy(
  proxy: Proxy,
  finding: Pick<LintMessage, 'message' | 'ruleId'> & { filePath: string }
): Policy | null {
  if (finding.ruleId && STRUCTURAL_RULES.has(finding.ruleId)) return null;
  const match = POLICY_FILE_RE.exec(finding.filePath.replace(/\\/g, '/'));
  if (!match) return null;
  return proxy.policies.find((p) => p.name === match[1] && p.xml.trim()) ?? null;
}
