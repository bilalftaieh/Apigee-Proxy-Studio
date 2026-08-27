import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { EmptyCard, OpenEntityButton, Row, SEVERITY_COLOR, SeverityBadge } from './common';
import type { GovernanceAnalysis, GovernanceSeverity, WorkspaceStats } from '../../types/workspace';

const SEVERITY_RANK: Record<GovernanceSeverity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Grouped by rule rather than by proxy, deliberately: "which of my proxies
 * don't rate-limit" is the question a workspace-wide sweep exists to answer,
 * and grouping by proxy would give you seven copies of the same finding to
 * re-read. Rules with no findings still render — a governance report that only
 * lists failures can't tell you what passed.
 */
export function GovernancePanel({ governance, stats }: { governance: GovernanceAnalysis; stats: WorkspaceStats }) {
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => {
    const waivedByRule = new Map<string, typeof governance.waived>();
    for (const w of governance.waived) {
      if (!waivedByRule.has(w.ruleId)) waivedByRule.set(w.ruleId, []);
      waivedByRule.get(w.ruleId)!.push(w);
    }
    return governance.rules
      .map((rule) => ({
        rule,
        findings: governance.findings.filter((f) => f.ruleId === rule.id),
        waived: waivedByRule.get(rule.id) || [],
      }))
      .sort((a, b) => {
        // Failing rules first, worst severity first, then most-violated.
        if (!a.findings.length !== !b.findings.length) return a.findings.length ? -1 : 1;
        return SEVERITY_RANK[a.rule.severity] - SEVERITY_RANK[b.rule.severity] || b.findings.length - a.findings.length;
      });
  }, [governance]);

  const copyReport = () => {
    const lines = [`# Workspace governance — ${stats.proxyCount} proxies`, ''];
    for (const { rule, findings, waived } of groups) {
      const status = findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : 'pass';
      lines.push(`## ${rule.id} — ${rule.label} (${rule.severity}, ${status})`);
      for (const f of findings) lines.push(`- **${f.name}** — ${f.message}`);
      for (const w of waived) lines.push(`- _${w.name} — waived_`);
      lines.push('');
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const failing = groups.filter((g) => g.findings.length);

  return (
    <div>
      <div className="card">
        <div className="row-between">
          <div>
            <h4 className="card-title">
              <Icon name="gavel" size={15} /> House rules
            </h4>
            <p className="card-subtitle">
              Your org's own standards, run across all {stats.proxyCount} proxies in one pass — as opposed to apigeelint
              (Apigee's rules) or the deploy checks (what stops a bundle running at all). These never block an export.
              Edit them in <code className="mono">server/src/seed/governanceRules.js</code>; waive one for a single proxy
              by adding its rule id to that proxy's excluded rules on its Lint tab.
            </p>
          </div>
          <button className="btn btn-sm" onClick={copyReport}>
            <Icon name={copied ? 'check' : 'clipboard-copy'} size={13} /> {copied ? 'Copied' : 'Copy report'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
          {(['error', 'warning', 'info'] as GovernanceSeverity[]).map((sev) => {
            const n = governance.findings.filter((f) => f.severity === sev).length;
            return (
              <div key={sev} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: n ? SEVERITY_COLOR[sev] : 'var(--text-3)' }}>{n}</span>
                <span className="field-hint">
                  {sev}
                  {n === 1 ? '' : 's'}
                </span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>{groups.length - failing.length}</span>
            <span className="field-hint">rules passing</span>
          </div>
        </div>
      </div>

      {!governance.findings.length && (
        <EmptyCard icon="shield-check" title="Every rule passes" body="No proxy in this workspace violates a house rule." />
      )}

      {groups.map(({ rule, findings, waived }) => (
        <div className="card" key={rule.id}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <SeverityBadge severity={findings.length ? rule.severity : 'info'}>
              {findings.length ? rule.severity : 'pass'}
            </SeverityBadge>
            <span className="mono field-hint">{rule.id}</span>
            <h4 className="card-title" style={{ margin: 0, fontSize: 13.5 }}>
              {rule.label}
            </h4>
            <span className="field-hint" style={{ marginLeft: 'auto' }}>
              {findings.length
                ? `${findings.length} of ${stats.proxyCount} proxies`
                : `all ${stats.proxyCount - waived.length} checked proxies pass`}
            </span>
          </div>

          <p className="card-subtitle" style={{ marginTop: 6 }}>
            {rule.rationale}
          </p>

          {findings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {findings.map((f, i) => (
                <Row severity={rule.severity} key={`${f.id}-${i}`}>
                  <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{f.name}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>{f.message}</span>
                  <OpenEntityButton id={f.id} name={f.name} />
                </Row>
              ))}
            </div>
          )}

          {waived.length > 0 && (
            <div className="field-hint" style={{ marginTop: 8 }}>
              Waived on: {waived.map((w) => w.name).join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
