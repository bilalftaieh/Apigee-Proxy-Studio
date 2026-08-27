// Presentation-layer helpers for the Test tab's results view. The server's
// TestRunResult/trace shape (see server/src/lib/testRunner.js) is a flat,
// chronological list of pipeline events — these functions reshape it into
// what the UI actually wants to render: collapsible phase sections, a
// unified console log (JS policies' print()/console.* output), and a single
// pass/fail verdict for the run as a whole.
import type { TestTraceEntry, TestRunResult } from '../types/proxy';
import type { AssertionResult } from './testAssertions';

const STATIC_PHASE_LABELS: Record<string, string> = {
  'proxy.preFlow.request': 'Proxy PreFlow — Request',
  'proxy.flows': 'Conditional flow matching',
  route: 'Route matching',
  'target.preFlow.request': 'Target PreFlow — Request',
  'target.flows': 'Target conditional flow matching',
  'target.postFlow.request': 'Target PostFlow — Request',
  mockBackend: 'Mock backend response',
  'target.preFlow.response': 'Target PreFlow — Response',
  'target.postFlow.response': 'Target PostFlow — Response',
  'proxy.postFlow.response': 'Proxy PostFlow — Response',
  fault: 'Fault raised',
  faultRules: 'Fault Rules',
};

const FLOW_PHASE = /^(proxy|target)\.flows\[(.+)\]\.(request|response)$/;
// The steps of one conditional <FaultRule> that matched, e.g. faultRules[SOAPFault].
const FAULT_RULE_PHASE = /^faultRules\[(.+)\]$/;

export function phaseLabel(phase: string): string {
  if (STATIC_PHASE_LABELS[phase]) return STATIC_PHASE_LABELS[phase];
  const fr = FAULT_RULE_PHASE.exec(phase);
  if (fr) return `Fault Rule "${fr[1]}"`;
  const m = FLOW_PHASE.exec(phase);
  if (m) {
    const [, scope, name, dir] = m;
    return `${scope === 'proxy' ? 'Proxy' : 'Target'} Flow "${name}" — ${dir === 'request' ? 'Request' : 'Response'}`;
  }
  return phase;
}

export type TraceGroupStatus = 'ok' | 'warn' | 'error' | 'skip';

export interface TraceGroup {
  key: string;
  label: string;
  entries: TestTraceEntry[];
  status: TraceGroupStatus;
}

function statusOf(entries: TestTraceEntry[]): TraceGroupStatus {
  if (entries.some((e) => e.error || e.phase === 'fault')) return 'error';
  if (entries.some((e) => e.emulated === false)) return 'warn';
  if (entries.every((e) => e.skipped || e.matched === false)) return 'skip';
  return 'ok';
}

// Phases run strictly in pipeline order and each one's entries are pushed
// back-to-back, so a simple "same key as the previous group" check is enough
// to cluster them — no need to bucket by key across the whole array.
export function groupTraceByPhase(trace: TestTraceEntry[]): TraceGroup[] {
  const groups: { key: string; entries: TestTraceEntry[] }[] = [];
  for (const entry of trace) {
    const last = groups[groups.length - 1];
    if (last && last.key === entry.phase) last.entries.push(entry);
    else groups.push({ key: entry.phase, entries: [entry] });
  }
  return groups.map((g) => ({ key: g.key, label: phaseLabel(g.key), entries: g.entries, status: statusOf(g.entries) }));
}

export type ConsoleLogLevel = 'print' | 'log' | 'warn' | 'error';

export interface ConsoleLogEntry {
  policyName: string;
  phase: string;
  level: ConsoleLogLevel;
  text: string;
}

const LOG_LINE = /^(print|log|warn|error): ([\s\S]*)$/;

// JS policy output rides inside trace[].notes as plain "level: text" strings
// (see server/src/lib/policyExecutors.js execJavascript) — pull those out
// into their own list so they read like a console instead of being buried
// among other policies' notes.
export function extractConsoleLogs(trace: TestTraceEntry[]): ConsoleLogEntry[] {
  const out: ConsoleLogEntry[] = [];
  for (const entry of trace) {
    if (entry.policyType !== 'Javascript' || !entry.notes?.length) continue;
    for (const note of entry.notes) {
      const m = LOG_LINE.exec(note);
      if (!m) continue;
      out.push({ policyName: entry.policyName || 'JavaScript policy', phase: entry.phase, level: m[1] as ConsoleLogLevel, text: m[2] });
    }
  }
  return out;
}

export type RunStatus = 'pass' | 'fail' | 'fault' | 'ran';

export interface RunSummary {
  status: RunStatus;
  passCount: number;
  totalCount: number;
}

// Precedence: graded assertions are the strongest signal (that's what the
// user explicitly said to check); with none defined, fall back to whether
// the run itself blew up, so a run is never reported as a bare, unlabeled
// "done" when something clearly went wrong.
export function summarizeRun(assertionResults: AssertionResult[], result: TestRunResult): RunSummary {
  const totalCount = assertionResults.length;
  const passCount = assertionResults.filter((r) => r.pass).length;
  if (totalCount > 0) return { status: passCount === totalCount ? 'pass' : 'fail', passCount, totalCount };
  return { status: result.fault ? 'fault' : 'ran', passCount, totalCount };
}
