import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Icon } from '../Icon';
import { ConfirmModal } from '../ConfirmModal';
import { evaluateAssertions, type AssertionResult } from '../../lib/testAssertions';
import { groupTraceByPhase, extractConsoleLogs, summarizeRun, type RunStatus, type TraceGroup, type ConsoleLogEntry } from '../../lib/testTrace';
import { nanoid } from '../../lib/id';
import type { TestAssertion, TestAssertionType, TestCase, TestHttpVerb, TestRunResult, TestTraceEntry } from '../../types/proxy';

const VERBS: TestHttpVerb[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

const ASSERTION_TYPES: { value: TestAssertionType; label: string }[] = [
  { value: 'status', label: 'Response status is' },
  { value: 'routedTo', label: 'Routed to target' },
  { value: 'fault', label: 'Fault occurred' },
  { value: 'variable', label: 'Variable equals' },
  { value: 'header', label: 'Response header equals' },
];

const STATUS_META: Record<RunStatus, { label: string; color: string; icon: string }> = {
  pass: { label: 'All assertions passed', color: 'var(--success)', icon: 'check-circle-2' },
  fail: { label: 'Assertions failed', color: 'var(--error)', icon: 'x-circle' },
  fault: { label: 'Unhandled fault — no assertions defined', color: 'var(--warning)', icon: 'alert-triangle' },
  ran: { label: 'Ran — no assertions defined', color: 'var(--text-3)', icon: 'info' },
};

const SECTION_TABS: { key: 'request' | 'mock' | 'assertions' | 'advanced'; label: string; icon: string }[] = [
  { key: 'request', label: 'Request', icon: 'arrow-right-circle' },
  { key: 'mock', label: 'Mock Backend', icon: 'server' },
  { key: 'assertions', label: 'Assertions', icon: 'list-checks' },
  { key: 'advanced', label: 'Advanced', icon: 'sliders-horizontal' },
];

function makeBlankAssertion(): TestAssertion {
  return { id: nanoid(), type: 'status', expected: '200' };
}

function prettyBody(content?: string | null): string {
  if (!content) return '(empty body)';
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

// Record<string,string> editor for headers/query params — plain add/edit/remove
// rows, no drag-reorder or anything fancier since these are small maps.
function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = 'Name',
  valuePlaceholder = 'Value',
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const entries = Object.entries(value);

  const addEntry = () => {
    if (!draftKey.trim()) return;
    onChange({ ...value, [draftKey.trim()]: draftValue });
    setDraftKey('');
    setDraftValue('');
  };

  const renameEntry = (oldKey: string, newKey: string) => {
    if (!newKey.trim() || newKey === oldKey) return;
    const next = { ...value };
    delete next[oldKey];
    next[newKey.trim()] = value[oldKey];
    onChange(next);
  };

  const removeEntry = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(([key, val]) => (
        <div className="entity-row" key={key}>
          <input
            className="mono"
            style={{ width: 160 }}
            defaultValue={key}
            onBlur={(e) => renameEntry(key, e.target.value)}
          />
          <input
            style={{ flex: 1 }}
            value={val}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            placeholder={valuePlaceholder}
          />
          <button className="icon-btn" onClick={() => removeEntry(key)} aria-label="Remove">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <div className="entity-row">
        <input
          className="mono"
          style={{ width: 160 }}
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder={keyPlaceholder}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
        />
        <input
          style={{ flex: 1 }}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          placeholder={valuePlaceholder}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
        />
        <button className="btn btn-sm" onClick={addEntry} disabled={!draftKey.trim()}>
          <Icon name="plus" size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function traceStepColor(entry: TestTraceEntry): string {
  if (entry.error || entry.phase === 'fault') return 'var(--error)';
  if (entry.emulated === false) return 'var(--warning)';
  if (entry.skipped || entry.matched === false) return 'var(--text-3)';
  return 'var(--success)';
}

function traceStepIcon(entry: TestTraceEntry): string {
  if (entry.error || entry.phase === 'fault') return 'alert-circle';
  if (entry.emulated === false) return 'help-circle';
  if (entry.skipped || entry.matched === false) return 'minus-circle';
  if (entry.evaluatingFlow || entry.evaluatingRule || entry.evaluatingFaultRule) return 'git-fork';
  if (entry.phase === 'mockBackend') return 'server';
  return 'check-circle-2';
}

function traceStepLabel(entry: TestTraceEntry): string {
  if (entry.policyName) {
    if (entry.error) return `${entry.policyName} — ${entry.error}`;
    if (entry.skipped) return `${entry.policyName} — skipped (condition not met)`;
    if (entry.emulated === false) return `${entry.policyName} (${entry.policyType}) — not emulated`;
    return `${entry.policyName} (${entry.policyType})`;
  }
  if (entry.evaluatingFlow) return `Flow "${entry.evaluatingFlow}" ${entry.matched ? 'matched' : 'did not match'}`;
  if (entry.evaluatingRule) return `Route "${entry.evaluatingRule}" ${entry.matched ? 'matched' : 'did not match'}`;
  if (entry.evaluatingFaultRule)
    return `Fault rule "${entry.evaluatingFaultRule}" ${entry.matched ? 'matched' : 'did not match'}`;
  if (entry.phase === 'mockBackend') return 'Mock backend responded';
  if (entry.phase === 'fault') return entry.message || 'Fault raised';
  return entry.phase;
}

function variableDiff(before?: Record<string, unknown>, after?: Record<string, unknown>): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: string[] = [];
  keys.forEach((k) => {
    if (before[k] !== after[k]) diffs.push(`${k} = ${JSON.stringify(after[k])}`);
  });
  return diffs;
}

function TraceStepRow({ entry }: { entry: TestTraceEntry }) {
  const diffs = variableDiff(entry.variablesBefore, entry.variablesAfter);
  return (
    <div className="trace-step" style={{ borderLeftColor: traceStepColor(entry) }}>
      <Icon name={traceStepIcon(entry)} size={14} color={traceStepColor(entry)} style={{ marginTop: 1, flexShrink: 0 }} />
      <div className="trace-step-body">
        <div className="row-between">
          <div className="field-hint mono" style={{ color: 'var(--text-3)', fontSize: 10.5 }}>
            {entry.phase}
          </div>
          {entry.durationMs !== undefined && (
            <div className="field-hint mono" style={{ color: 'var(--text-3)', fontSize: 10.5 }}>
              {entry.durationMs}ms
            </div>
          )}
        </div>
        <div style={{ fontSize: 12.5 }}>{traceStepLabel(entry)}</div>
        {entry.unsupportedCondition && (
          <div className="trace-step-notes">Condition couldn't be parsed — treated as not matched: {entry.condition}</div>
        )}
        {entry.notes?.map((note, i) => (
          <div className="trace-step-notes" key={i}>
            {note}
          </div>
        ))}
        {diffs.length > 0 && <div className="trace-var-diff">{diffs.join(', ')}</div>}
      </div>
    </div>
  );
}

function TraceGroupRow({ group, open, onToggle }: { group: TraceGroup; open: boolean; onToggle: () => void }) {
  const color =
    group.status === 'error' ? 'var(--error)' : group.status === 'warn' ? 'var(--warning)' : group.status === 'skip' ? 'var(--text-3)' : 'var(--success)';
  const icon =
    group.status === 'error' ? 'alert-circle' : group.status === 'warn' ? 'help-circle' : group.status === 'skip' ? 'minus-circle' : 'check-circle-2';
  return (
    <div className="trace-group">
      <div className="trace-group-header" onClick={onToggle}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} color="var(--text-3)" />
        <Icon name={icon} size={13} color={color} />
        <span className="trace-group-label">{group.label}</span>
        <span className="trace-group-count">{group.entries.length}</span>
      </div>
      {open && (
        <div className="trace-group-body">
          {group.entries.map((entry, i) => (
            <TraceStepRow entry={entry} key={i} />
          ))}
        </div>
      )}
    </div>
  );
}

const CONSOLE_LEVEL_META: Record<ConsoleLogEntry['level'], { color: string; icon: string }> = {
  print: { color: 'var(--accent-blue)', icon: 'terminal' },
  log: { color: 'var(--text-1)', icon: 'terminal' },
  warn: { color: 'var(--warning)', icon: 'alert-triangle' },
  error: { color: 'var(--error)', icon: 'alert-circle' },
};

function ConsoleView({ logs }: { logs: ConsoleLogEntry[] }) {
  if (!logs.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '16px 2px' }}>
        No console output — nothing called <code className="mono">print()</code> or <code className="mono">console.*</code> from a JavaScript policy
        this run.
      </div>
    );
  }
  return (
    <div className="console-log">
      {logs.map((l, i) => {
        const meta = CONSOLE_LEVEL_META[l.level];
        return (
          <div className="console-line" key={i}>
            <Icon name={meta.icon} size={12} color={meta.color} style={{ flexShrink: 0, marginTop: 2 }} />
            <span className="console-line-source mono">{l.policyName}</span>
            <span className="mono console-line-text" style={{ color: meta.color }}>
              {l.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VariablesView({ variables }: { variables: Record<string, unknown> }) {
  const [filter, setFilter] = useState('');
  const allEntries = Object.entries(variables);
  const entries = allEntries.filter(([k]) => k.toLowerCase().includes(filter.toLowerCase()));

  if (!allEntries.length) {
    return <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '16px 2px' }}>No custom flow variables were set during this run.</div>;
  }

  return (
    <div>
      <input
        className="mono"
        style={{ width: '100%', marginBottom: 8 }}
        placeholder="Filter variables…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="variables-table">
        {entries.map(([k, v]) => (
          <div className="variables-row" key={k}>
            <span className="mono variables-key">{k}</span>
            <span className="mono variables-value">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
          </div>
        ))}
        {entries.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 2px' }}>No variables match "{filter}"</div>}
      </div>
    </div>
  );
}

function AssertionChecklist({ assertions, results }: { assertions: TestAssertion[]; results: AssertionResult[] }) {
  if (!assertions.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {assertions.map((a, i) => {
        const r = results[i];
        const typeLabel = ASSERTION_TYPES.find((t) => t.value === a.type)?.label;
        const expectedLabel = a.type === 'fault' ? (a.expected === 'true' ? 'a fault' : 'no fault') : `"${a.expected}"`;
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
            <Icon name={r?.pass ? 'check-circle-2' : 'x-circle'} size={14} color={r?.pass ? 'var(--success)' : 'var(--error)'} style={{ flexShrink: 0 }} />
            <span>
              {typeLabel} {a.name && <b className="mono">{a.name}</b>} — expected {expectedLabel}
            </span>
            {!r?.pass && <span className="field-hint mono">got: {r?.actual || '(empty)'}</span>}
          </div>
        );
      })}
    </div>
  );
}

type ResultTabKey = 'overview' | 'trace' | 'console' | 'variables';

function TestResultPanel({ test, result, assertionResults }: { test: TestCase; result: TestRunResult; assertionResults: AssertionResult[] }) {
  const [tab, setTab] = useState<ResultTabKey>('overview');
  const groups = useMemo(() => groupTraceByPhase(result.trace), [result]);
  const consoleLogs = useMemo(() => extractConsoleLogs(result.trace), [result]);
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  // Reset per-run UI state (which trace groups start open, which sub-tab is
  // shown) whenever a *new* run result comes in — `result` is a fresh object
  // each run, so this doesn't fire on unrelated re-renders.
  useEffect(() => {
    const initial: Record<number, boolean> = {};
    groups.forEach((g, i) => {
      initial[i] = g.status === 'error' || g.status === 'warn';
    });
    setExpandedGroups(initial);
    setTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const summary = summarizeRun(assertionResults, result);
  const meta = STATUS_META[summary.status];
  const totalDurationMs = result.trace.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  return (
    <div className="card result-card">
      <div className="result-banner" style={{ borderLeftColor: meta.color }}>
        <Icon name={meta.icon} size={18} color={meta.color} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: meta.color, fontSize: 13.5 }}>
            {meta.label}
            {summary.totalCount > 0 && ` — ${summary.passCount}/${summary.totalCount}`}
          </div>
          <div className="field-hint" style={{ marginTop: 3 }}>
            {result.fault ? (
              <>
                Fault: <b>{result.fault.message}</b> ({result.fault.status})
              </>
            ) : (
              <>
                Response <b className="mono">{result.response?.status ?? '—'}</b>
              </>
            )}
            {' · '}Routed to <b className="mono">{result.routedTo ?? '—'}</b>
            {result.matchedFlow && (
              <>
                {' · '}Flow <b className="mono">{result.matchedFlow}</b>
              </>
            )}
            {totalDurationMs > 0 && <>{` · ${totalDurationMs}ms policy time`}</>}
          </div>
        </div>
      </div>

      {result.notEmulated.length > 0 && (
        <div className="field-hint" style={{ color: 'var(--warning)', marginTop: 10 }}>
          Not emulated (ran as no-op): {result.notEmulated.join(', ')}
        </div>
      )}

      <div className="result-tabs">
        <button className={`result-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button className={`result-tab ${tab === 'trace' ? 'active' : ''}`} onClick={() => setTab('trace')}>
          Trace ({result.trace.length})
        </button>
        <button className={`result-tab ${tab === 'console' ? 'active' : ''}`} onClick={() => setTab('console')}>
          Console{consoleLogs.length > 0 ? ` (${consoleLogs.length})` : ''}
        </button>
        <button className={`result-tab ${tab === 'variables' ? 'active' : ''}`} onClick={() => setTab('variables')}>
          Variables ({Object.keys(result.variables).length})
        </button>
      </div>

      <div className="result-tab-body">
        {tab === 'overview' && (
          <>
            {test.assertions.length > 0 ? (
              <AssertionChecklist assertions={test.assertions} results={assertionResults} />
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                No assertions defined — add some in the Assertions tab to get a pass/fail verdict instead of just a raw response.
              </div>
            )}
            <div className="section-label" style={{ marginTop: 14 }}>
              Response body
            </div>
            <pre className="mono result-body-pre">{prettyBody(result.response?.content)}</pre>
          </>
        )}
        {tab === 'trace' && (
          <div className="trace-timeline">
            {groups.map((g, i) => (
              <TraceGroupRow key={i} group={g} open={!!expandedGroups[i]} onToggle={() => setExpandedGroups((prev) => ({ ...prev, [i]: !prev[i] }))} />
            ))}
          </div>
        )}
        {tab === 'console' && <ConsoleView logs={consoleLogs} />}
        {tab === 'variables' && <VariablesView variables={result.variables} />}
      </div>
    </div>
  );
}

function RequestSection({ test, updateTest }: { test: TestCase; updateTest: (id: string, patch: Partial<TestCase>) => void }) {
  return (
    <>
      <p className="card-subtitle">What gets sent into the proxy's PreFlow — no real network call is made.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 10 }}>
        <select
          style={{ width: 110 }}
          value={test.request.verb}
          onChange={(e) => updateTest(test.id, { request: { ...test.request, verb: e.target.value as TestHttpVerb } })}
        >
          {VERBS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="mono"
          style={{ flex: 1 }}
          placeholder="/orders/123"
          value={test.request.pathSuffix}
          onChange={(e) => updateTest(test.id, { request: { ...test.request, pathSuffix: e.target.value } })}
        />
      </div>
      <div className="section-label">Headers</div>
      <KeyValueEditor
        value={test.request.headers}
        onChange={(headers) => updateTest(test.id, { request: { ...test.request, headers } })}
        keyPlaceholder="Header"
      />
      <div className="section-label">Query params</div>
      <KeyValueEditor
        value={test.request.queryParams}
        onChange={(queryParams) => updateTest(test.id, { request: { ...test.request, queryParams } })}
        keyPlaceholder="Param"
      />
      <div className="section-label">Body</div>
      <textarea
        className="mono"
        style={{ width: '100%', minHeight: 90 }}
        placeholder="Request payload (optional)"
        value={test.request.body}
        onChange={(e) => updateTest(test.id, { request: { ...test.request, body: e.target.value } })}
      />
    </>
  );
}

function MockSection({ test, updateTest }: { test: TestCase; updateTest: (id: string, patch: Partial<TestCase>) => void }) {
  return (
    <>
      <p className="card-subtitle">Stands in for the real backend — this is what the target's response flow sees.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 10, alignItems: 'center' }}>
        <span className="field-hint">Status</span>
        <input
          type="number"
          style={{ width: 90 }}
          value={test.mockTargetResponse.status}
          onChange={(e) => updateTest(test.id, { mockTargetResponse: { ...test.mockTargetResponse, status: Number(e.target.value) || 0 } })}
        />
      </div>
      <div className="section-label">Headers</div>
      <KeyValueEditor
        value={test.mockTargetResponse.headers}
        onChange={(headers) => updateTest(test.id, { mockTargetResponse: { ...test.mockTargetResponse, headers } })}
        keyPlaceholder="Header"
      />
      <div className="section-label">Body</div>
      <textarea
        className="mono"
        style={{ width: '100%', minHeight: 90 }}
        placeholder='{"id": 123}'
        value={test.mockTargetResponse.body}
        onChange={(e) => updateTest(test.id, { mockTargetResponse: { ...test.mockTargetResponse, body: e.target.value } })}
      />
    </>
  );
}

function AssertionRow({
  assertion,
  result,
  onChange,
  onRemove,
}: {
  assertion: TestAssertion;
  result?: AssertionResult;
  onChange: (patch: Partial<TestAssertion>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="entity-row">
      {result && (
        <Icon
          name={result.pass ? 'check-circle-2' : 'x-circle'}
          size={14}
          color={result.pass ? 'var(--success)' : 'var(--error)'}
          style={{ flexShrink: 0 }}
        />
      )}
      <select
        style={{ width: 170 }}
        value={assertion.type}
        onChange={(e) => onChange({ type: e.target.value as TestAssertionType, name: undefined })}
      >
        {ASSERTION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      {(assertion.type === 'variable' || assertion.type === 'header') && (
        <input
          className="mono"
          style={{ width: 140 }}
          placeholder={assertion.type === 'variable' ? 'extracted.id' : 'X-Order-Id'}
          value={assertion.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      )}
      {assertion.type === 'fault' ? (
        <select style={{ flex: 1 }} value={assertion.expected || 'false'} onChange={(e) => onChange({ expected: e.target.value })}>
          <option value="false">No fault</option>
          <option value="true">Fault raised</option>
        </select>
      ) : (
        <input
          className="mono"
          style={{ flex: 1 }}
          placeholder="expected value"
          value={assertion.expected}
          onChange={(e) => onChange({ expected: e.target.value })}
        />
      )}
      {result && !result.pass && <span className="field-hint mono">got: {result.actual || '(empty)'}</span>}
      <button className="icon-btn" onClick={onRemove} aria-label="Remove assertion">
        <Icon name="trash-2" size={13} />
      </button>
    </div>
  );
}

function AssertionsSection({
  test,
  updateTest,
  assertionResults,
}: {
  test: TestCase;
  updateTest: (id: string, patch: Partial<TestCase>) => void;
  assertionResults?: AssertionResult[];
}) {
  return (
    <>
      <div className="row-between">
        <p className="card-subtitle" style={{ margin: 0 }}>
          Checked against the last run.
        </p>
        <button className="btn btn-sm" onClick={() => updateTest(test.id, { assertions: [...test.assertions, makeBlankAssertion()] })}>
          <Icon name="plus" size={13} /> Add Assertion
        </button>
      </div>
      {test.assertions.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '10px 2px' }}>No assertions yet — Run still works without any.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: test.assertions.length ? 10 : 0 }}>
        {test.assertions.map((a, i) => (
          <AssertionRow
            key={a.id}
            assertion={a}
            result={assertionResults?.[i]}
            onChange={(patch) =>
              updateTest(test.id, { assertions: test.assertions.map((existing) => (existing.id === a.id ? { ...existing, ...patch } : existing)) })
            }
            onRemove={() => updateTest(test.id, { assertions: test.assertions.filter((existing) => existing.id !== a.id) })}
          />
        ))}
      </div>
    </>
  );
}

function AdvancedSection({
  initialStateText,
  initialStateError,
  onChange,
}: {
  initialStateText: string;
  initialStateError: string | null;
  onChange: (text: string) => void;
}) {
  return (
    <>
      <p className="card-subtitle">
        A single test run is one request — a fresh Quota/KVM store has nothing to read or exceed on its own. Seed starting state here to simulate
        "this key already exists" or "this is request N in the window". See <code className="mono">TestInitialState</code> shape, e.g.{' '}
        <code className="mono">{'{ "quota": { "Q-Name::": 2 } }'}</code>.
      </p>
      <textarea className="mono" style={{ width: '100%', minHeight: 140, marginTop: 8 }} value={initialStateText} onChange={(e) => onChange(e.target.value)} />
      {initialStateError && (
        <div className="field-hint" style={{ color: 'var(--error)', marginTop: 6 }}>
          {initialStateError}
        </div>
      )}
    </>
  );
}

function TestEditorPanel({ test }: { test: TestCase }) {
  const updateTest = useStore((s) => s.updateTest);
  const duplicateTest = useStore((s) => s.duplicateTest);
  const runTest = useStore((s) => s.runTest);
  const testRunningId = useStore((s) => s.testRunningId);
  const testResultsByTestId = useStore((s) => s.testResultsByTestId);
  const isRunning = testRunningId === test.id;
  const result = testResultsByTestId[test.id];

  const [section, setSection] = useState<'request' | 'mock' | 'assertions' | 'advanced'>('request');
  const [initialStateText, setInitialStateText] = useState(() => JSON.stringify(test.initialState ?? {}, null, 2));
  const [initialStateError, setInitialStateError] = useState<string | null>(null);

  const assertionResults = result ? evaluateAssertions(test.assertions, result) : undefined;

  const handleInitialStateChange = (text: string) => {
    setInitialStateText(text);
    if (!text.trim()) {
      setInitialStateError(null);
      updateTest(test.id, { initialState: undefined });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setInitialStateError(null);
      updateTest(test.id, { initialState: parsed });
    } catch {
      setInitialStateError('Invalid JSON — not saved until this parses');
    }
  };

  return (
    <div className="test-editor">
      <div className="policy-editor-head">
        <input className="mono" value={test.name} onChange={(e) => updateTest(test.id, { name: e.target.value })} />
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => duplicateTest(test.id)} aria-label="Duplicate test" title="Duplicate">
            <Icon name="copy" size={13} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => runTest(test)} disabled={isRunning}>
            {isRunning ? <span className="spinner" /> : <Icon name="play" size={13} />}
            {isRunning ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      <div className="test-editor-tabs">
        {SECTION_TABS.map((s) => (
          <button key={s.key} className={`test-editor-tab ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>
            <Icon name={s.icon} size={13} /> {s.label}
            {s.key === 'assertions' && test.assertions.length > 0 && <span className="badge-count">{test.assertions.length}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        {section === 'request' && <RequestSection test={test} updateTest={updateTest} />}
        {section === 'mock' && <MockSection test={test} updateTest={updateTest} />}
        {section === 'assertions' && <AssertionsSection test={test} updateTest={updateTest} assertionResults={assertionResults} />}
        {section === 'advanced' && (
          <AdvancedSection initialStateText={initialStateText} initialStateError={initialStateError} onChange={handleInitialStateChange} />
        )}
      </div>

      {result && assertionResults ? (
        <TestResultPanel test={test} result={result} assertionResults={assertionResults} />
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <Icon name="play-circle" size={22} color="var(--text-3)" />
          <p className="card-subtitle" style={{ margin: '10px 0 0' }}>
            Run this test to see the pass/fail verdict, trace, console output, and response here.
          </p>
        </div>
      )}
    </div>
  );
}

export function TestsTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const selectedTestId = useStore((s) => s.selectedTestId);
  const setSelectedTestId = useStore((s) => s.setSelectedTestId);
  const addTest = useStore((s) => s.addTest);
  const duplicateTest = useStore((s) => s.duplicateTest);
  const generateNegativeTests = useStore((s) => s.generateNegativeTests);
  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateNegativeTests();
    } finally {
      setGenerating(false);
    }
  };
  const testResultsByTestId = useStore((s) => s.testResultsByTestId);
  const testRunningId = useStore((s) => s.testRunningId);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const removeTest = useStore((s) => s.removeTest);

  const selected = proxy.tests.find((t) => t.id === selectedTestId) || proxy.tests[0];

  if (!proxy.tests.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
        <Icon name="flask-conical" size={26} color="var(--text-3)" />
        <h4 style={{ margin: '14px 0 6px' }}>No tests yet</h4>
        <p className="card-subtitle" style={{ margin: '0 0 18px' }}>
          Simulate a request through this proxy's flows and policies without deploying anywhere — no real network call
          is ever made, the target response is whatever you supply.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={addTest}>
            <Icon name="plus" size={14} /> Add Test
          </button>
          <button className="btn" onClick={handleGenerate} disabled={generating}>
            {generating ? <span className="spinner" /> : <Icon name="wand-2" size={14} />}
            Generate Negative Tests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tests-layout">
      <div className="test-list-col">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={addTest}>
            <Icon name="plus" size={13} /> Add Test
          </button>
          <button className="btn btn-sm" onClick={handleGenerate} disabled={generating} title="Derive failure-path tests from this proxy's flow contracts and attached policies">
            {generating ? <span className="spinner" /> : <Icon name="wand-2" size={13} />}
          </button>
        </div>
        <div className="test-list">
          {proxy.tests.map((t) => {
            const result = testResultsByTestId[t.id];
            const status = result ? summarizeRun(evaluateAssertions(t.assertions, result), result).status : null;
            const running = testRunningId === t.id;
            const dotColor = status ? STATUS_META[status].color : 'var(--text-3)';
            return (
              <div key={t.id} className={`test-list-item ${selected?.id === t.id ? 'active' : ''}`} onClick={() => setSelectedTestId(t.id)}>
                {running ? <span className="spinner spinner-sm" /> : <span className="test-status-dot" style={{ background: dotColor }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="test-list-item-name mono">
                    {t.name}
                    {t.generated && (
                      <span className="field-hint" style={{ marginLeft: 6 }} title="Generated — will be replaced by the next regeneration unless edited">
                        <Icon name="wand-2" size={10} />
                      </span>
                    )}
                  </div>
                  <div className="test-list-item-request">
                    {t.request.verb} {t.request.pathSuffix}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateTest(t.id);
                  }}
                  aria-label="Duplicate test"
                  title="Duplicate"
                >
                  <Icon name="copy" size={13} />
                </button>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete({ id: t.id, name: t.name });
                  }}
                  aria-label="Delete test"
                >
                  <Icon name="trash-2" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selected && <TestEditorPanel test={selected} key={selected.id} />}

      {toDelete && (
        <ConfirmModal
          title="Delete test?"
          message={`"${toDelete.name}" will be removed.`}
          onConfirm={() => removeTest(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
