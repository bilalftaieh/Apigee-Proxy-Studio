export interface Step {
  policyName: string;
  condition?: string;
}

export type ConditionVerb = 'ANY' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
export type PathOperator = 'MatchesPath' | 'Equals';

/**
 * The request/response shape of one operation, captured from whatever the flow
 * was created from (an OpenAPI operation, a Postman request) and used to
 * regenerate faithful Postman/OpenAPI artifacts later.
 *
 * Apigee itself never sees any of this — it's design-time metadata that would
 * otherwise be thrown away at import and have to be re-typed by hand to get a
 * runnable test collection back out.
 */
export interface FlowParam {
  name: string;
  in: 'query' | 'header' | 'path';
  required?: boolean;
  description?: string;
  /** JSON Schema primitive name: string, integer, number, boolean. */
  type?: string;
  enumValues?: string[];
  /** A concrete value that actually works, when the source provided one. */
  example?: string;
}

export interface FlowBody {
  contentType: string;
  required?: boolean;
  /** JSON Schema for the body, with $refs already resolved at import time. */
  schema?: unknown;
  /** Ready-to-send example body. Preferred over deriving one from `schema`. */
  example?: string;
  /** For application/x-www-form-urlencoded and multipart bodies. */
  formParams?: FlowParam[];
}

export interface FlowResponse {
  /** '200', '404', or 'default'. */
  status: string;
  description?: string;
  contentType?: string;
  example?: string;
}

export interface FlowContract {
  /** Preserved from the source so a re-exported spec keeps its original ids. */
  operationId?: string;
  params: FlowParam[];
  body?: FlowBody;
  responses: FlowResponse[];
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  condition: string;
  /** 'simple' drives `condition` from pathValue/pathOperator/verb; 'custom' means `condition` is hand-edited. */
  conditionMode: 'simple' | 'custom';
  pathValue?: string;
  pathOperator?: PathOperator;
  verb?: ConditionVerb;
  request: Step[];
  response: Step[];
  /** Absent on flows built by hand in the UI, and on anything saved before this existed. */
  contract?: FlowContract;
  /**
   * Kept in the proxy but left out of the exported bundle (and the test
   * simulator) entirely when false — a "soft delete" for a flow you might
   * need again, so turning it off doesn't lose its steps/condition/contract.
   * Defaults to true when absent.
   */
  enabled?: boolean;
}

export interface VarValue {
  mode: 'literal' | 'variable';
  value: string;
}

/**
 * TLS settings for the proxy→backend leg. apigeelint's TD012 wants exactly one
 * <SSLInfo> on an https target and none on a plain-http one, so the generator
 * only emits this when the target actually speaks https.
 */
export interface SslInfo {
  enabled: boolean;
  clientAuthEnabled?: boolean;
  /** Usually a `ref://` reference to an environment keystore. */
  keyStore?: string;
  keyAlias?: string;
  trustStore?: string;
  /** Skips hostname/chain validation — for local experiments only. */
  ignoreValidationErrors?: boolean;
}

/**
 * Google-minted credential for the outbound call, so a proxy can reach an
 * IAM-protected GCP backend (Cloud Run, Cloud Functions, a Google API) without
 * managing a secret. An ID token authenticates *to a service* (audience); an
 * access token authorizes *against Google APIs* (scopes).
 */
export type TargetAuthMode = 'none' | 'googleIdToken' | 'googleAccessToken';

export interface TargetAuthentication {
  mode: TargetAuthMode;
  /** GoogleIDToken audience — ignored when useTargetUrl is set. */
  audience?: VarValue;
  /** Derive the audience from the resolved target URL instead of a literal. */
  useTargetUrl?: boolean;
  /** GoogleAccessToken OAuth scopes. */
  scopes?: string[];
  /** Header the token is injected into. Defaults to Authorization. */
  headerName?: string;
}

/**
 * A streaming (SSE) response pipeline. Steps here run per server-sent event
 * rather than once per response — this is where an LLMTokenQuota counting
 * policy has to live for a streaming model target.
 *
 * Response-only by design: Apigee rejects a <Request> child of <EventFlow>.
 */
export interface EventFlow {
  contentType: string;
  response: Step[];
}

/**
 * One conditional <FaultRule>. Apigee evaluates these top-to-bottom when a
 * fault is raised and runs the *first* rule whose condition is true, then stops
 * â€” so a rule with a blank condition always matches and makes everything below
 * it unreachable. When nothing matches, the DefaultFaultRule runs instead.
 */
export interface FaultRule {
  id: string;
  name: string;
  /** Blank = always matches. e.g. `error.message = "Received non success response code"` */
  condition?: string;
  steps: Step[];
}

/**
 * The fault handling attached to a ProxyEndpoint or TargetEndpoint.
 *
 * The two halves are separate XML elements, not two flavours of one thing:
 * `rules` are the conditional <FaultRules><FaultRule> entries, and `steps` is
 * the single unconditional <DefaultFaultRule>. The default can never be
 * expressed as a <FaultRule> nested inside <FaultRules> â€” Apigee's runtime
 * casts anything *named* "DefaultFaultRule" to a DefaultFaultRuleBean and
 * throws at deploy time if it's a plain FaultRuleBean. See
 * buildFaultRulesBlock in server/src/lib/bundleGenerator.js.
 */
export interface FaultRules {
  /**
   * Absent on anything saved before conditional fault rules existed, hence
   * optional â€” read it as `rules ?? []`. normalizeFaultRules (model.js) fills
   * it in on load, so a round-tripped proxy always has the field.
   */
  rules?: FaultRule[];
  /** The unconditional <DefaultFaultRule> â€” runs when no rule above matched. */
  steps: Step[];
}

export interface Target {
  id: string;
  name: string;
  description?: string;
  /** 'url' targets a literal/variable URL; 'targetServer' load-balances across named Apigee Target Server entities. */
  mode: 'url' | 'targetServer';
  url: VarValue;
  targetServers: string[];
  path?: VarValue;
  preFlow: { request: Step[]; response: Step[] };
  postFlow: { request: Step[]; response: Step[] };
  flows: Flow[];
  faultRules: FaultRules;
  eventFlow?: EventFlow;
  sslInfo?: SslInfo;
  authentication?: TargetAuthentication;
}

export interface EnvironmentTargetOverride {
  mode?: 'url' | 'targetServer';
  url?: VarValue;
  targetServers?: string[];
  path?: VarValue;
}

export interface ProxyEnvironment {
  id: string;
  name: string;
  /** Keyed by Target.id — only targets with an override here are affected. */
  targetOverrides: Record<string, EnvironmentTargetOverride>;
}

/**
 * Where a matched route sends the request:
 *  - 'target' → <TargetEndpoint>, the normal case
 *  - 'url'    → <URL>, calling a backend directly and bypassing /targets
 *  - 'null'   → no destination at all (`<RouteRule name="x"/>`), for when the
 *               ProxyEndpoint has already produced the response — e.g. served
 *               from cache, or fully handled in JavaScript
 */
export type RouteRuleMode = 'target' | 'url' | 'null';

export interface RouteRule {
  id: string;
  name: string;
  targetName: string;
  condition?: string;
  /** Defaults to 'target' when absent, which is how every pre-existing rule is stored. */
  mode?: RouteRuleMode;
  /** Only used when mode is 'url'. */
  url?: string;
}

export interface Policy {
  id: string;
  name: string;
  type: string;
  xml: string;
  // No `resource`: resource files live in Proxy.resources / SharedFlow.resources
  // and are referenced from this policy's XML. See foldPolicyResources in
  // server/src/lib/model.js, which migrates the old per-policy shape on load.
}

/**
 * A bundle resource file owned by the proxy rather than by any single
 * policy — the standard Apigee pattern for a `resources/jsc/utils.js` helper
 * pulled into several Javascript policies via `<IncludeURL>jsc://utils.js</IncludeURL>`,
 * or a shared `resources/properties/shared.properties`. `Policy.resource`
 * (above) is a policy's *own* file and keeps working unchanged — the two
 * collections coexist, this one just covers files that belong to zero or more
 * policies rather than exactly one.
 */
export interface BundleResource {
  id: string;
  /** Bundle-relative, always starts "resources/". e.g. "resources/jsc/utils.js" */
  path: string;
  content: string;
}

export interface Proxy {
  id: string;
  name: string;
  basePath: string;
  description: string;
  proxyEndpointName: string;
  policies: Policy[];
  resources: BundleResource[];
  targets: Target[];
  preFlow: { request: Step[]; response: Step[] };
  postFlow: { request: Step[]; response: Step[] };
  /**
   * Runs after the response has already gone back to the client, so it costs
   * the caller no latency. Apigee only allows MessageLogging here, and it's the
   * only place where client.sent.*.timestamp is populated.
   *
   * Response-only by design: the flow has no request side.
   */
  postClientFlow?: { response: Step[] };
  flows: Flow[];
  routeRules: RouteRule[];
  faultRules: FaultRules;
  lintExcludes: string[];
  environments: ProxyEnvironment[];
  tests: TestCase[];
  createdAt: number;
  updatedAt: number;
}

export interface ProxySummary {
  id: string;
  name: string;
  basePath: string;
  description: string;
  updatedAt: number;
  createdAt: number;
  policyCount: number;
  flowCount: number;
}

export interface LintMessage {
  line: number | null;
  column: number | null;
  ruleId: string | null;
  message: string;
  severity: 'error' | 'warning';
}

export interface LintFileResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: LintMessage[];
}

export interface LintResult {
  ok: boolean;
  systemError?: string;
  files: LintFileResult[];
  errorCount: number;
  warningCount: number;
}

/**
 * Apigee classifies every policy as Standard or Extensible. This is a billing
 * distinction, not a capability one: Standard policies deploy to any
 * environment type, while attaching even one Extensible policy converts the
 * whole proxy to Extensible billing — every call to it, not just the ones that
 * touch that policy.
 */
export type PolicyTier = 'standard' | 'extensible';

export interface PolicyTypeMeta {
  key: string;
  tier: PolicyTier;
  label: string;
  category: string;
  icon: string;
  accent: string;
  description: string;
  hasResource: boolean;
}

/** Where a policy-chain step gets wired in the ProxyEndpoint once created. */
export type PolicyChainStepPhase = 'preFlow-request' | 'preFlow-response' | 'postFlow-request' | 'postFlow-response' | 'faultRules';

export interface PolicyChainStep {
  type: string;
  phase: PolicyChainStepPhase;
}

/** A curated, one-click multi-policy unit — see server/src/seed/policyChains.js. */
export interface PolicyChainMeta {
  key: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  steps: PolicyChainStep[];
}

export interface HistorySnapshotSummary {
  id: string;
  savedAt: number;
  name: string;
  basePath: string;
  policyCount: number;
  flowCount: number;
}

// ------------------------------------------------------------------- Testing
export type TestHttpVerb = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

export interface TestRequest {
  verb: TestHttpVerb;
  pathSuffix: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: string;
}

export interface MockTargetResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type TestAssertionType = 'status' | 'routedTo' | 'fault' | 'variable' | 'header';

export interface TestAssertion {
  id: string;
  type: TestAssertionType;
  /** Variable name (for 'variable') or header name (for 'header') — unused by the other types. */
  name?: string;
  expected: string;
}

// Seeds the mock KVM/Cache/Quota/SpikeArrest stores before the run — without
// this a fresh KVM Get or Quota check has nothing to read/exceed on a single
// simulated request. See server/src/lib/testContext.js for the exact shape.
export interface TestInitialState {
  kvm?: Record<string, Record<string, string>>;
  cache?: Record<string, Record<string, string>>;
  quota?: Record<string, number>;
  spikeArrest?: Record<string, number>;
}

export interface TestCase {
  id: string;
  name: string;
  request: TestRequest;
  mockTargetResponse: MockTargetResponse;
  assertions: TestAssertion[];
  initialState?: TestInitialState;
  /** Produced by "Generate negative tests" — regenerating replaces only these, never a hand-written or hand-edited test. Cleared on first edit. */
  generated?: boolean;
}

export interface TestHeader {
  name: string;
  value: string;
}

export interface TestMessageSnapshot {
  status?: number;
  reasonPhrase?: string;
  headers: TestHeader[];
  content: string;
}

export interface TestTraceEntry {
  phase: string;
  policyName?: string;
  policyType?: string;
  emulated?: boolean;
  skipped?: boolean;
  notes?: string[];
  error?: string;
  condition?: string;
  unsupportedCondition?: boolean;
  evaluatingFlow?: string;
  evaluatingRule?: string;
  /** Name of the conditional <FaultRule> whose condition was just evaluated. */
  evaluatingFaultRule?: string;
  matched?: boolean;
  message?: string;
  status?: number;
  response?: TestMessageSnapshot;
  variablesBefore?: Record<string, unknown>;
  variablesAfter?: Record<string, unknown>;
  durationMs?: number;
}

export interface TestFault {
  message: string;
  status?: number;
  reasonPhrase?: string;
  payload?: string;
  headers?: Record<string, string>;
  policyName?: string;
}

export interface TestRunResult {
  trace: TestTraceEntry[];
  notEmulated: string[];
  request: TestMessageSnapshot | null;
  response: TestMessageSnapshot | null;
  fault: TestFault | null;
  matchedFlow: string | null;
  matchedTargetFlow: string | null;
  routedTo: string | null;
  variables: Record<string, unknown>;
}

export interface BundleDiffHunk {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface BundleDiffResult {
  added: string[];
  removed: string[];
  changed: { path: string; hunks: BundleDiffHunk[] }[];
  unchanged: string[];
  leftFiles: Record<string, string>;
  rightFiles: Record<string, string>;
}

/** One side of a /bundle/diff request — a full proxy, or a pointer at a saved snapshot. */
export type DiffSide = { proxy: Proxy } | { proxyId: string; snapshotId: string };

export type PrerequisiteKind =
  | 'targetServer'
  | 'keystore'
  | 'truststore'
  | 'kvm'
  | 'cache'
  | 'serviceAccount'
  | 'sharedFlow'
  | 'apiProduct';

/** An org/environment artifact this proxy depends on but the bundle itself does not contain. */
export interface Prerequisite {
  kind: PrerequisiteKind;
  name: string;
  source: string;
  detail: string | null;
  cli: string | null;
}

export interface Template {
  id: string;
  builtIn: boolean;
  name: string;
  description: string;
  tags: string[];
  proxy: Omit<Proxy, 'id' | 'createdAt' | 'updatedAt'>;
  createdAt?: number;
  updatedAt?: number;
}
