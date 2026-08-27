/**
 * Shapes returned by GET /api/workspace/audit — the cross-proxy questions the
 * Apigee console can't answer because it only ever shows one proxy at a time.
 * Mirrors server/src/lib/workspaceAudit.js.
 */

/** Enough to name a proxy or shared flow and open it. */
export interface WorkspaceRef {
  id: string;
  name: string;
}

// ------------------------------------------------------------------ base paths

export interface BasePathEntry extends WorkspaceRef {
  /** Normalized: leading slash, no trailing slash. */
  basePath: string;
  /** Exactly as stored on the proxy, for when the two differ. */
  raw: string;
  wildcard: boolean;
}

export interface BasePathConflict {
  basePath: string;
  proxies: WorkspaceRef[];
}

export interface BasePathNesting {
  basePath: string;
  proxies: WorkspaceRef[];
  shadowed: { basePath: string; proxies: WorkspaceRef[] }[];
}

export interface BasePathAnalysis {
  map: BasePathEntry[];
  conflicts: BasePathConflict[];
  nested: BasePathNesting[];
  wildcards: BasePathEntry[];
}

// -------------------------------------------------------------------- backends

export interface BackendUsage extends WorkspaceRef {
  /** `Target "default"` or `RouteRule "noroute"`. */
  where: string;
  /** null when this is the proxy's base config rather than an environment override. */
  environment: string | null;
  detail: string;
}

export interface BackendHost {
  key: string;
  scheme: string;
  host: string;
  usages: BackendUsage[];
}

export interface BackendTargetServer {
  name: string;
  usages: BackendUsage[];
}

export interface BackendAnalysis {
  hosts: BackendHost[];
  targetServers: BackendTargetServer[];
  /** Endpoints whose host is templated, so they name no single backend. */
  dynamic: BackendUsage[];
}

// ---------------------------------------------------------------- shared flows

export interface SharedFlowCaller extends WorkspaceRef {
  kind: 'proxy' | 'sharedFlow';
  policyName: string;
  /** False when the FlowCallout policy exists but is wired into no Step — it never runs. */
  attached: boolean;
}

export interface SharedFlowNode {
  name: string;
  definedLocally: boolean;
  localId: string | null;
  callers: SharedFlowCaller[];
}

export interface SharedFlowAnalysis {
  flows: SharedFlowNode[];
  empty: { id: string; name: string; callerCount: number }[];
  unused: { id: string | null; name: string }[];
  missing: SharedFlowNode[];
  cycles: string[][];
}

// ------------------------------------------------------------------ governance

export type GovernanceSeverity = 'error' | 'warning' | 'info';

export interface GovernanceRuleMeta {
  id: string;
  label: string;
  severity: GovernanceSeverity;
  rationale: string;
}

export interface GovernanceFinding extends WorkspaceRef {
  ruleId: string;
  severity: GovernanceSeverity;
  message: string;
}

export interface GovernanceAnalysis {
  rules: GovernanceRuleMeta[];
  findings: GovernanceFinding[];
  waived: (WorkspaceRef & { ruleId: string })[];
}

// ---------------------------------------------------------------------- audit

export interface WorkspaceStats {
  proxyCount: number;
  sharedFlowCount: number;
  hostCount: number;
  targetServerCount: number;
  basePathConflicts: number;
  governanceErrors: number;
  governanceWarnings: number;
}

export interface WorkspaceAudit {
  generatedAt: number;
  stats: WorkspaceStats;
  basePaths: BasePathAnalysis;
  backends: BackendAnalysis;
  sharedFlowUsage: SharedFlowAnalysis;
  governance: GovernanceAnalysis;
}
