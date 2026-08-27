// Curated multi-policy "chains" — one-click units insertable into any
// existing proxy's flow, as opposed to whole-proxy templates (seed/templates.js)
// which only apply at proxy creation. Each step's `phase` says where in the
// ProxyEndpoint it gets wired: PreFlow/PostFlow request or response, or the
// proxy's default fault rule. Policy XML itself still comes from the normal
// policy-type defaults (policyTemplates.js) — chains only assemble and place
// them; the visual/XML editors remain the review step afterward.
export const POLICY_CHAINS = [
  {
    key: 'secured-rest-api',
    label: 'Secure REST API',
    description:
      'API-key auth, spike protection, a monthly quota and CORS headers — the four policies almost every public REST proxy needs, wired into PreFlow in the right order.',
    icon: 'shield-check',
    accent: '#2FD48F',
    steps: [
      { type: 'SpikeArrest', phase: 'preFlow-request' },
      { type: 'VerifyAPIKey', phase: 'preFlow-request' },
      { type: 'Quota', phase: 'preFlow-request' },
      { type: 'CorsHeaders', phase: 'preFlow-response' },
    ],
  },
  {
    key: 'oauth-protected-api',
    label: 'OAuth-Protected API',
    description:
      'Verifies an OAuth v2.0 access token, then caps and smooths traffic per app — the shape of most token-authenticated proxies.',
    icon: 'key-round',
    accent: '#6C8EFF',
    steps: [
      { type: 'SpikeArrest', phase: 'preFlow-request' },
      { type: 'OAuthV2', phase: 'preFlow-request' },
      { type: 'Quota', phase: 'preFlow-request' },
    ],
  },
  {
    key: 'payload-threat-protection',
    label: 'Payload Threat Protection',
    description:
      'Screens incoming JSON and XML payloads for malicious structure and returns a clean, structured error instead of a raw parser failure.',
    icon: 'shield-alert',
    accent: '#F2555C',
    steps: [
      { type: 'JSONThreatProtection', phase: 'preFlow-request' },
      { type: 'XMLThreatProtection', phase: 'preFlow-request' },
      { type: 'RaiseFault', phase: 'faultRules' },
    ],
  },
  {
    key: 'mediation-error-handling',
    label: 'Mediation & Error Handling',
    description:
      'Extracts a path parameter, reshapes the response payload, and returns structured JSON errors via a default fault rule.',
    icon: 'shuffle',
    accent: '#FFB454',
    steps: [
      { type: 'ExtractVariables', phase: 'preFlow-request' },
      { type: 'AssignMessage', phase: 'postFlow-response' },
      { type: 'RaiseFault', phase: 'faultRules' },
    ],
  },
];

export function getPolicyChain(key) {
  return POLICY_CHAINS.find((c) => c.key === key);
}
