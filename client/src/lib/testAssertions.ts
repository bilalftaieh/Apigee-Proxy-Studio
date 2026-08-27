import type { TestAssertion, TestRunResult } from '../types/proxy';

export interface AssertionResult {
  assertion: TestAssertion;
  pass: boolean;
  actual: string;
}

// Grades a TestCase's assertions against a TestRunResult already returned by
// the server — the runner itself is assertion-agnostic (see
// server/src/lib/testRunner.js), it just executes and reports; this is
// purely a client-side comparison over that report.
export function evaluateAssertions(assertions: TestAssertion[], result: TestRunResult): AssertionResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'status': {
        const actual = String(result.response?.status ?? result.fault?.status ?? '');
        return { assertion, pass: actual === assertion.expected, actual };
      }
      case 'routedTo': {
        const actual = result.routedTo ?? '';
        return { assertion, pass: actual === assertion.expected, actual };
      }
      case 'fault': {
        const actual = result.fault ? 'true' : 'false';
        return { assertion, pass: actual === (assertion.expected || 'false'), actual };
      }
      case 'variable': {
        const actual = assertion.name ? String(result.variables[assertion.name] ?? '') : '';
        return { assertion, pass: actual === assertion.expected, actual };
      }
      case 'header': {
        const actual = assertion.name
          ? result.response?.headers.find((h) => h.name.toLowerCase() === assertion.name!.toLowerCase())?.value ?? ''
          : '';
        return { assertion, pass: actual === assertion.expected, actual };
      }
      default:
        return { assertion, pass: false, actual: '' };
    }
  });
}
