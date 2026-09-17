import { POLICY_NAME_PREFIXES } from './policyNames';

/**
 * Apigee groups its policies into four families, and that grouping is the one
 * thing worth spending colour on: it answers "what kind of work happens here"
 * before you have read a single policy name.
 *
 * The server already tags every policy type with a `category`
 * (server/src/lib/policyTemplates.js), but at a finer grain than is useful as
 * colour — eight categories is more hues than anyone can hold, and the extra
 * five are all sub-kinds of two of the four. So they fold: Caching is traffic
 * shaping, and AI/LLM, logging and KVM storage are all things Apigee itself
 * classes as extension callouts.
 *
 * Folding here rather than renaming the server's categories keeps the finer
 * labels available for the places that show the category as text (the add
 * dialog groups by it), and means a category added server-side degrades to a
 * neutral chip instead of breaking.
 */
export type PolicyCategory = 'security' | 'traffic' | 'mediation' | 'extension' | 'other';

const CATEGORY_BY_SERVER_LABEL: Record<string, PolicyCategory> = {
  Security: 'security',
  'Traffic Management': 'traffic',
  Caching: 'traffic',
  Mediation: 'mediation',
  Extension: 'extension',
  'AI / LLM': 'extension',
  'Logging & Observability': 'extension',
  'Storage & Config': 'extension',
};

/**
 * Fallback for when the policy-types list hasn't loaded, or the bundle carries
 * a type the server doesn't know (an imported proxy can). Keyed on the type
 * name itself so an unrecognised policy still lands in the right family.
 */
const CATEGORY_BY_TYPE: Record<string, PolicyCategory> = {
  VerifyAPIKey: 'security',
  OAuthV2: 'security',
  VerifyJWT: 'security',
  GenerateJWT: 'security',
  DecodeJWT: 'security',
  VerifyJWS: 'security',
  GenerateJWS: 'security',
  DecodeJWS: 'security',
  BasicAuthentication: 'security',
  CORS: 'security',
  HMAC: 'security',
  AccessControl: 'security',
  VerifyIAM: 'security',
  RegularExpressionProtection: 'security',
  JSONThreatProtection: 'security',
  XMLThreatProtection: 'security',
  GetOAuthV2Info: 'security',
  SetOAuthV2Info: 'security',
  DeleteOAuthV2Info: 'security',

  Quota: 'traffic',
  ResetQuota: 'traffic',
  SpikeArrest: 'traffic',
  MonetizationLimitsCheck: 'traffic',
  ResponseCache: 'traffic',
  PopulateCache: 'traffic',
  LookupCache: 'traffic',
  InvalidateCache: 'traffic',

  AssignMessage: 'mediation',
  CorsHeaders: 'mediation',
  RaiseFault: 'mediation',
  ExtractVariables: 'mediation',
  ParsePayload: 'mediation',
  JSONToXML: 'mediation',
  XMLToJSON: 'mediation',
  AssertCondition: 'mediation',
  ReadPropertySet: 'mediation',
  HTTPModifier: 'mediation',

  ServiceCallout: 'extension',
  ExternalCallout: 'extension',
  FlowCallout: 'extension',
  Javascript: 'extension',
  PythonScript: 'extension',
  JavaCallout: 'extension',
  IntegrationCallout: 'extension',
  SetIntegrationRequest: 'extension',
  KeyValueMapOperations: 'extension',
  AccessEntity: 'extension',
  MessageLogging: 'extension',
  MessageLoggingSyslog: 'extension',
  PublishMessage: 'extension',
  DataCapture: 'extension',
  TraceCapture: 'extension',
};

/** `serverCategory` is PolicyTypeMeta.category when the type list has loaded. */
export function policyCategory(type: string, serverCategory?: string): PolicyCategory {
  if (serverCategory && CATEGORY_BY_SERVER_LABEL[serverCategory]) {
    return CATEGORY_BY_SERVER_LABEL[serverCategory];
  }
  return CATEGORY_BY_TYPE[type] || 'other';
}

export const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  security: 'Security',
  traffic: 'Traffic',
  mediation: 'Mediation',
  extension: 'Extension',
  other: 'Other',
};

/**
 * The two-letter tag shown on every policy row. It reuses the apigeelint name
 * prefix the studio already generates names from, so the chip and the name
 * agree — a policy called `EV-ExtractOrderId` shows `EV`.
 */
export function policyAbbr(type: string): string {
  const prefix = POLICY_NAME_PREFIXES[type];
  if (prefix) return prefix.split('-')[0].slice(0, 4);
  return type.slice(0, 2).toUpperCase();
}
