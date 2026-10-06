import { Icon } from './Icon';
import type { ConditionAnalysis, ConditionIssue } from '../lib/conditionLint';

/**
 * What the app made of a condition, under the input that produced it.
 *
 * Two jobs, in this order. First it reads the condition back in plain terms —
 * the verb and the path it detected — because the failure mode a hand-typed
 * condition has is not "Apigee rejected it" but "it means something other than
 * what you thought", and that is only visible if something says out loud what
 * it means. Then it lists what looks wrong, each with the one-click rewrite
 * where there is only one sensible rewrite.
 *
 * `compact` drops the first job and reports nothing when there is nothing
 * wrong. That is the right shape everywhere except a conditional flow: a step
 * condition, a fault rule and a route rule are all tests on their own terms —
 * a fault rule reading `fault.name = "InvalidApiKey"` has no path or verb to
 * name, and a green line under every one of a dozen steps would be a dozen
 * lines of nothing.
 */

const TONE_ICON = {
  error: 'x-circle',
  warning: 'alert-triangle',
  ok: 'check-circle',
} as const;

function IssueRow({ issue, apply }: { issue: ConditionIssue; apply: (() => void) | null }) {
  return (
    <li className="cond-issue" data-severity={issue.severity}>
      <Icon
        className="cond-issue-icon"
        name={issue.severity === 'error' ? 'x-circle' : issue.severity === 'warning' ? 'alert-triangle' : 'info'}
        size={13}
      />
      <span className="cond-issue-text">{issue.message}</span>
      {issue.fix && apply && (
        <button type="button" className="cond-issue-fix" onClick={apply}>
          <Icon name="wand-2" size={11} /> {issue.fix.label}
        </button>
      )}
    </li>
  );
}

export function ConditionCheck({
  analysis,
  describedById,
  fixFor,
  onUseBuilder,
  compact,
}: {
  analysis: ConditionAnalysis;
  /** Wired to the condition input's aria-describedby. */
  describedById: string;
  /** Issues only, and nothing at all when there are none. */
  compact?: boolean;
  /**
   * How this editing mode applies a given fix, or null when it can't express
   * it — the two modes write to different fields, and Path / Verb can only act
   * on the handful of issues that are about the path it owns.
   */
  fixFor?: (issue: ConditionIssue) => (() => void) | null;
  /** Absent when the condition isn't expressible in the builder. */
  onUseBuilder?: () => void;
}) {
  const errors = analysis.issues.filter((i) => i.severity === 'error').length;
  const warnings = analysis.issues.filter((i) => i.severity === 'warning').length;
  const tone = errors > 0 || analysis.parseError ? 'error' : warnings > 0 ? 'warning' : 'ok';

  const detected = analysis.verb || analysis.path;
  const extras = analysis.extras.length;

  const issues = analysis.issues.length > 0 && (
    <ul className="cond-issues">
      {analysis.issues.map((issue, i) => (
        <IssueRow key={`${issue.id}-${issue.start}-${i}`} issue={issue} apply={(issue.fix && fixFor?.(issue)) || null} />
      ))}
    </ul>
  );

  if (compact) {
    if (!issues) return null;
    return (
      <div className="cond-check cond-check-compact" data-tone={tone} id={describedById}>
        {issues}
      </div>
    );
  }

  return (
    <div className="cond-check" data-tone={tone} id={describedById}>
      <div className="cond-check-head">
        <Icon className="cond-check-icon" name={TONE_ICON[tone]} size={13} />
        {analysis.parseError ? (
          <span className="cond-check-label">Apigee can&rsquo;t read this condition</span>
        ) : detected ? (
          <>
            <span className="cond-check-label">Matches</span>
            {analysis.verb && <span className="cond-chip cond-chip-verb">{analysis.verb}</span>}
            {analysis.path ? (
              <span className="cond-chip cond-chip-path mono" title={`proxy.pathsuffix ${analysis.pathOperator} "${analysis.path}"`}>
                {analysis.path}
              </span>
            ) : (
              <span className="cond-check-note">any path</span>
            )}
            {!analysis.verb && <span className="cond-check-note">any verb</span>}
            {extras > 0 && (
              <span className="cond-check-note" title={analysis.extras.join('\n')}>
                and {extras} other {extras === 1 ? 'test' : 'tests'}
              </span>
            )}
          </>
        ) : (
          <span className="cond-check-label">
            {extras > 0 ? (
              <>
                No plain path or verb here &mdash; this matches on its own{' '}
                <span title={analysis.extras.join('\n')}>{extras === 1 ? 'test' : `${extras} tests`}</span>
              </>
            ) : (
              'Nothing to match on yet'
            )}
          </span>
        )}

        {onUseBuilder && (
          /* The condition is exactly what the Path / Verb controls produce, so
             offer them back: two dropdowns and a text field are easier to keep
             right than a string, and everything the string says survives. */
          <button
            type="button"
            className="cond-check-builder"
            onClick={onUseBuilder}
            title="This condition is just a path and a verb — edit it with the Path / Verb controls instead"
          >
            <Icon name="sparkles" size={11} /> Edit as Path / Verb
          </button>
        )}
      </div>

      {issues}
    </div>
  );
}
