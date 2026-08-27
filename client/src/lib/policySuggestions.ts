export interface PolicySuggestion {
  type: string;
  reason: string;
}

// Curated "pairs well with" rules — deliberately small and static rather than
// inferred, so suggestions stay predictable. Keyed by the policy type that was
// just added; each entry is filtered against policy types already present.
const SUGGESTION_RULES: Record<string, PolicySuggestion[]> = {
  OAuthV2: [
    { type: 'Quota', reason: 'Cap how many calls each OAuth-authenticated app can make.' },
    { type: 'SpikeArrest', reason: 'Smooth out traffic bursts before they reach your backend.' },
  ],
  VerifyAPIKey: [
    { type: 'Quota', reason: 'Cap how many calls each API key can make.' },
    { type: 'SpikeArrest', reason: 'Smooth out traffic bursts before they reach your backend.' },
  ],
  BasicAuthentication: [{ type: 'SpikeArrest', reason: 'Protect the backend from traffic bursts.' }],
  VerifyJWT: [{ type: 'RaiseFault', reason: 'Return a clean error response when the token is invalid or expired.' }],
  HMAC: [{ type: 'RaiseFault', reason: 'Return a clean error response when the signature check fails.' }],
  Quota: [{ type: 'SpikeArrest', reason: 'Quota governs long-term volume — SpikeArrest smooths short bursts too.' }],
  SpikeArrest: [{ type: 'Quota', reason: 'SpikeArrest only smooths bursts — pair it with a Quota for real usage limits.' }],
  Javascript: [{ type: 'RaiseFault', reason: 'Catch script errors with a structured fault response instead of a raw stack trace.' }],
  PythonScript: [{ type: 'RaiseFault', reason: 'Catch script errors with a structured fault response instead of a raw stack trace.' }],
  JavaCallout: [{ type: 'RaiseFault', reason: 'Catch callout errors with a structured fault response instead of a raw stack trace.' }],
  ServiceCallout: [{ type: 'RaiseFault', reason: 'Handle a failing backend callout with a clean fault response.' }],
  FlowCallout: [{ type: 'RaiseFault', reason: 'Handle a failing shared flow with a clean fault response.' }],
  XMLThreatProtection: [{ type: 'RaiseFault', reason: 'Return a clean 400 instead of a raw parser error on a rejected payload.' }],
  JSONThreatProtection: [{ type: 'RaiseFault', reason: 'Return a clean 400 instead of a raw parser error on a rejected payload.' }],
  RegularExpressionProtection: [{ type: 'RaiseFault', reason: 'Return a clean 400 instead of a raw error on a rejected payload.' }],
};

/** Suggestions for `addedType`, minus any policy type already present in the bundle. */
export function getPolicySuggestions(addedType: string, existingTypes: string[]): PolicySuggestion[] {
  const rules = SUGGESTION_RULES[addedType];
  if (!rules) return [];
  const existing = new Set(existingTypes);
  return rules.filter((r) => !existing.has(r.type));
}
