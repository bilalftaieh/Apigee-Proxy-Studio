import type { Policy } from '../types/proxy';

// Each prefix is one apigeelint accepts for that policy type (its PO007
// "policy name should indicate its type" rule), so generated names don't
// immediately warn. If you add a type here, check the accepted prefixes in
// apigeelint's plugins/policyMetaData.json under `indications`.
export const POLICY_NAME_PREFIXES: Record<string, string> = {
  AssignMessage: 'AM',
  CorsHeaders: 'AM-Cors',
  RaiseFault: 'RF',
  ExtractVariables: 'EV',
  ParsePayload: 'PP',
  JSONToXML: 'J2X',
  XMLToJSON: 'X2J',
  AssertCondition: 'Assert',
  ReadPropertySet: 'RPS',
  HTTPModifier: 'HTTPM',

  VerifyAPIKey: 'VA',
  OAuthV2: 'OA',
  VerifyJWT: 'VJWT',
  GenerateJWT: 'GJWT',
  DecodeJWT: 'JWT-Decode',
  VerifyJWS: 'VJWS',
  GenerateJWS: 'GJWS',
  DecodeJWS: 'DecodeJWS',
  BasicAuthentication: 'BA',
  CORS: 'CORS',
  HMAC: 'HMAC',
  AccessControl: 'AC',
  VerifyIAM: 'VIAM',
  RegularExpressionProtection: 'REP',
  JSONThreatProtection: 'JTP',
  XMLThreatProtection: 'XTP',

  GetOAuthV2Info: 'OAI-Get',
  SetOAuthV2Info: 'OAI-Set',
  DeleteOAuthV2Info: 'OAuthV2-Delete',

  ServiceCallout: 'SC',
  ExternalCallout: 'EC',
  FlowCallout: 'FC',
  Javascript: 'JS',
  PythonScript: 'PY',
  JavaCallout: 'JavaC',
  IntegrationCallout: 'IntC',
  SetIntegrationRequest: 'SIR',

  SpikeArrest: 'SA',
  Quota: 'Q',
  ResetQuota: 'RQ',
  MonetizationLimitsCheck: 'MC',

  ResponseCache: 'RC',
  PopulateCache: 'PC',
  LookupCache: 'LC',
  InvalidateCache: 'IC',

  KeyValueMapOperations: 'KVM',
  AccessEntity: 'AE',

  MessageLogging: 'ML',
  MessageLoggingSyslog: 'ML-Syslog',
  PublishMessage: 'PM',
  DataCapture: 'DC',
  TraceCapture: 'TC',

  LLMTokenQuota: 'LTQ',
  PromptTokenLimit: 'PTL',
  SanitizeUserPrompt: 'SUP',
  SanitizeModelResponse: 'SMR',
  SemanticCacheLookup: 'SCL',
  SemanticCachePopulate: 'SCP',
};

/**
 * Picks the next free "<Prefix>-<n>" name for `type` given the policies already
 * in the bundle. Starts counting from how many policies of that type already
 * exist, then walks forward past any exact-name collision — matters when
 * adding several policies at once (e.g. a policy chain) before each is
 * individually persisted.
 */
export function suggestPolicyName(type: string, existingPolicies: Pick<Policy, 'type' | 'name'>[]): string {
  const prefix = POLICY_NAME_PREFIXES[type] || type;
  const takenNames = new Set(existingPolicies.map((p) => p.name));
  let n = existingPolicies.filter((p) => p.type === type).length + 1;
  let name = `${prefix}-${n}`;
  while (takenNames.has(name)) {
    n += 1;
    name = `${prefix}-${n}`;
  }
  return name;
}
