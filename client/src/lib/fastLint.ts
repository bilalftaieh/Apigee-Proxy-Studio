export interface FastLintIssue {
  ruleId: string;
  severity: 'warning' | 'info';
  message: string;
  /** Character offsets into the policy's raw XML string, for editor markers. */
  startIndex: number;
  endIndex: number;
  quickFix?: {
    label: string;
    apply: (xml: string) => string;
  };
}

function isWellFormed(xml: string): boolean {
  if (!xml.trim()) return false;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return !doc.querySelector('parsererror');
}

/**
 * Fast, in-process structural checks against a single policy's raw XML —
 * no subprocess, no bundle generation, safe to run on every keystroke.
 * Deliberately a small, high-value subset of what the full apigeelint pass
 * (the Lint tab) checks; that pass still runs at export time regardless.
 */
export function lintPolicyXml(xml: string, policyName: string): FastLintIssue[] {
  // Mid-edit XML is routinely unparsable for a keystroke or two — Monaco's
  // own XML syntax highlighting covers that; skip until it's well-formed again.
  if (!isWellFormed(xml)) return [];

  const openTagMatch = xml.match(/<([A-Za-z][\w.-]*)\b([^>]*)>/);
  if (!openTagMatch) return [];
  const tagName = openTagMatch[1];
  const attrsText = openTagMatch[2];
  const attrsStart = openTagMatch.index! + 1 + tagName.length;

  const issues: FastLintIssue[] = [];

  const nameAttrMatch = attrsText.match(/\bname\s*=\s*"([^"]*)"/);
  if (nameAttrMatch && nameAttrMatch[1] !== policyName) {
    const start = attrsStart + nameAttrMatch.index!;
    issues.push({
      ruleId: 'name-mismatch',
      severity: 'warning',
      message: `Root element's name ("${nameAttrMatch[1]}") doesn't match this policy's file name ("${policyName}") — Apigee requires them to be identical.`,
      startIndex: start,
      endIndex: start + nameAttrMatch[0].length,
      quickFix: {
        label: `Rename to "${policyName}"`,
        apply: (current) => current.replace(nameAttrMatch[0], `name="${policyName}"`),
      },
    });
  }

  const disabledMatch = attrsText.match(/\benabled\s*=\s*"false"/);
  if (disabledMatch) {
    const start = attrsStart + disabledMatch.index!;
    issues.push({
      ruleId: 'policy-disabled',
      severity: 'info',
      message: 'This policy is disabled (enabled="false") and will be skipped at runtime.',
      startIndex: start,
      endIndex: start + disabledMatch[0].length,
      quickFix: {
        label: 'Enable this policy',
        apply: (current) => current.replace(disabledMatch[0], 'enabled="true"'),
      },
    });
  }

  if (!/<DisplayName>/.test(xml)) {
    const insertAt = openTagMatch.index! + openTagMatch[0].length;
    issues.push({
      ruleId: 'missing-display-name',
      severity: 'info',
      message: 'No <DisplayName> — Apigee falls back to the file name, but an explicit one reads better in the console.',
      startIndex: insertAt,
      endIndex: insertAt,
      quickFix: {
        label: 'Insert <DisplayName>',
        apply: (current) => `${current.slice(0, insertAt)}\n    <DisplayName>${policyName}</DisplayName>${current.slice(insertAt)}`,
      },
    });
  }

  return issues;
}
