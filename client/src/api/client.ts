import type {
  AiFixResult,
  AiPolicyResult,
  AiReviewResult,
  AiPreview,
  AiStatus,
  BundleDiffResult,
  DiffSide,
  HistorySnapshotSummary,
  LintMessage,
  LintResult,
  Policy,
  PolicyChainMeta,
  PolicyTypeMeta,
  Prerequisite,
  Proxy,
  ProxySummary,
  Template,
  TestCase,
  TestRunResult,
} from '../types/proxy';
import type { SharedFlow, SharedFlowSummary } from '../types/sharedFlow';
import type { WorkspaceAudit } from '../types/workspace';

import { createLogger } from '../lib/log/logger';

const BASE = '/api';

const log = createLogger('api');

/**
 * Every call to the server goes through here.
 *
 * One place to instrument means a request cannot be added later that quietly
 * isn't logged. It records the timing the browser actually experienced — which
 * includes the network and the JSON parse the server's own duration cannot see
 * — and pairs it with the `x-request-id` the server put on the response, so a
 * line here and a line there are provably the same request.
 *
 * A thrown fetch (server not running, dev proxy not up) is logged as an error:
 * it is otherwise the least informative failure in the app, surfacing as a bare
 * "Failed to fetch" toast with nothing to say which call it was.
 */
async function loggedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method || 'GET';
  const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  const began = performance.now();

  try {
    const res = await fetch(url, init);
    const ms = Math.round((performance.now() - began) * 100) / 100;
    // Successful calls are debug — routine, and the server logs them too. A
    // non-2xx is a warning here regardless of what the server made of it,
    // because from the UI's side it is a thing that did not work.
    log[res.ok ? 'debug' : 'warn'](`${method} ${path} ${res.status}`, {
      ms,
      reqId: res.headers.get('x-request-id') || undefined,
    });
    return res;
  } catch (err) {
    log.error(`${method} ${path} could not reach the server`, {
      ms: Math.round((performance.now() - began) * 100) / 100,
      reason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function downloadBlob(res: Response, filename: string): Promise<void> {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await loggedFetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed: ${res.status}`) as Error & { requestId?: string };
    // Carried on the error rather than folded into its message: the message is
    // shown to the user in a toast and should stay readable, while anything
    // that catches this can log the id and tie the failure to the server's side
    // of it.
    error.requestId = body.requestId || res.headers.get('x-request-id') || undefined;
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listProxies: () => request<ProxySummary[]>('/proxies'),
  getProxy: (id: string) => request<Proxy>(`/proxies/${id}`),
  createProxy: (data: { name: string; basePath?: string; description?: string }) =>
    request<Proxy>('/proxies', { method: 'POST', body: JSON.stringify(data) }),
  saveProxy: (id: string, data: Partial<Proxy>) =>
    request<Proxy>(`/proxies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProxy: (id: string) => request<void>(`/proxies/${id}`, { method: 'DELETE' }),
  duplicateProxy: (id: string) => request<Proxy>(`/proxies/${id}/duplicate`, { method: 'POST' }),
  async importProxyZip(file: File): Promise<{ proxy: Proxy; warnings: string[] }> {
    const buf = await file.arrayBuffer();
    const res = await loggedFetch(`${BASE}/proxies/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: buf,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Import failed');
    }
    return res.json();
  },
  importCurl: (curl: string) =>
    request<{ proxy: Proxy; warnings: string[] }>('/proxies/import/curl', { method: 'POST', body: JSON.stringify({ curl }) }),
  importOpenApi: (spec: string) =>
    request<{ proxy: Proxy; warnings: string[] }>('/proxies/import/openapi', { method: 'POST', body: JSON.stringify({ spec }) }),
  importPostman: (collection: string) =>
    request<{ proxy: Proxy; warnings: string[] }>('/proxies/import/postman', { method: 'POST', body: JSON.stringify({ collection }) }),
  importWsdl: (wsdl: string) =>
    request<{ proxy: Proxy; warnings: string[] }>('/proxies/import/wsdl', { method: 'POST', body: JSON.stringify({ wsdl }) }),
  listProxyHistory: (id: string) => request<HistorySnapshotSummary[]>(`/proxies/${id}/history`),
  restoreProxyHistory: (id: string, snapshotId: string) =>
    request<Proxy>(`/proxies/${id}/history/${snapshotId}/restore`, { method: 'POST' }),

  listTemplates: () => request<Template[]>('/templates'),
  saveAsTemplate: (data: { name: string; description?: string; proxy: Proxy }) =>
    request<Template>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
  useTemplate: (id: string, data: { name: string; basePath?: string }) =>
    request<Proxy>(`/templates/${id}/use`, { method: 'POST', body: JSON.stringify(data) }),

  // Reads every saved proxy and shared flow off disk server-side, so it
  // reflects saved state rather than whatever the editor is currently holding.
  auditWorkspace: () => request<WorkspaceAudit>('/workspace/audit'),

  aiStatus: () => request<AiStatus>('/ai/status'),
  previewAiRequest: (body: { intent: string; policyType?: string | null; proxy: Proxy | null }) =>
    request<AiPreview>('/ai/preview', { method: 'POST', body: JSON.stringify(body) }),
  generateAiPolicy: (body: { intent: string; policyType?: string | null; proxy: Proxy | null }) =>
    request<AiPolicyResult>('/ai/policy', { method: 'POST', body: JSON.stringify(body) }),
  previewAiFix: (body: { proxy: Proxy; finding: LintMessage & { filePath: string } }) =>
    request<AiPreview>('/ai/fix/preview', { method: 'POST', body: JSON.stringify(body) }),
  generateAiFix: (body: { proxy: Proxy; finding: LintMessage & { filePath: string } }) =>
    request<AiFixResult>('/ai/fix', { method: 'POST', body: JSON.stringify(body) }),
  previewAiReview: (body: { proxy: Proxy }) =>
    request<AiPreview>('/ai/review/preview', { method: 'POST', body: JSON.stringify(body) }),
  generateAiReview: (body: { proxy: Proxy }) =>
    request<AiReviewResult>('/ai/review', { method: 'POST', body: JSON.stringify(body) }),

  listPolicyTypes: () => request<PolicyTypeMeta[]>('/policy-types'),
  listPolicyChains: () => request<PolicyChainMeta[]>('/policy-chains'),
  getPolicyDefaults: (type: string, name: string) =>
    request<{ xml: string; resource: { path: string; content: string } | null }>('/policy-defaults', {
      method: 'POST',
      body: JSON.stringify({ type, name }),
    }),

  previewBundle: (proxy: Proxy, environmentId?: string | null) =>
    request<{ files: Record<string, string> }>('/bundle/preview', {
      method: 'POST',
      body: JSON.stringify({ proxy, environmentId }),
    }),

  lintBundle: (proxy: Proxy, environmentId?: string | null) =>
    request<LintResult>('/bundle/lint', {
      method: 'POST',
      body: JSON.stringify({ proxy, environmentId }),
    }),

  getPrerequisites: (proxy: Proxy, environmentId?: string | null) =>
    request<{ items: Prerequisite[] }>('/bundle/prerequisites', {
      method: 'POST',
      body: JSON.stringify({ proxy, environmentId }),
    }),

  diffBundles: (left: DiffSide, right: DiffSide, environmentId?: string | null) =>
    request<BundleDiffResult>('/bundle/diff', {
      method: 'POST',
      body: JSON.stringify({ left, right, environmentId }),
    }),

  async parseProxyZip(file: File): Promise<{ proxy: Proxy; warnings: string[] }> {
    const buf = await file.arrayBuffer();
    const res = await loggedFetch(`${BASE}/bundle/parse-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: buf,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Parse failed');
    }
    return res.json();
  },

  runProxyTest: (proxy: Proxy, test: Pick<TestCase, 'request' | 'mockTargetResponse' | 'initialState'>, environmentId?: string | null) =>
    request<TestRunResult>('/bundle/test-run', {
      method: 'POST',
      body: JSON.stringify({ proxy, test, environmentId }),
    }),

  generateNegativeTests: (proxy: Proxy) =>
    request<{ tests: TestCase[] }>('/bundle/generate-tests', {
      method: 'POST',
      body: JSON.stringify({ proxy }),
    }),

  async exportBundle(proxy: Proxy, environmentId?: string | null): Promise<void> {
    const res = await loggedFetch(`${BASE}/bundle/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy, environmentId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Export failed');
    }
    const env = proxy.environments.find((e) => e.id === environmentId);
    await downloadBlob(res, `${proxy.name}${env ? `-${env.name}` : ''}.zip`);
  },

  async exportDeploySet(proxy: Proxy, environmentId?: string | null): Promise<void> {
    const res = await loggedFetch(`${BASE}/bundle/export-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy, environmentId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Export failed');
    }
    await downloadBlob(res, `${proxy.name}-deploy-set.zip`);
  },

  async exportPostmanCollection(proxy: Proxy): Promise<void> {
    const res = await loggedFetch(`${BASE}/bundle/export-postman`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Export failed');
    }
    await downloadBlob(res, `${proxy.name}.postman_collection.json`);
  },

  async exportOpenApiSpec(proxy: Proxy, format: 'json' | 'yaml'): Promise<void> {
    const res = await loggedFetch(`${BASE}/bundle/export-openapi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy, format }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Export failed');
    }
    await downloadBlob(res, `${proxy.name}.openapi.${format}`);
  },

  async importSharedFlowZip(file: File): Promise<{ sharedFlow: SharedFlow; warnings: string[] }> {
    const buf = await file.arrayBuffer();
    const res = await loggedFetch(`${BASE}/sharedflow-bundle/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: buf,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Import failed');
    }
    return res.json();
  },
  listSharedFlows: () => request<SharedFlowSummary[]>('/sharedflows'),
  getSharedFlow: (id: string) => request<SharedFlow>(`/sharedflows/${id}`),
  createSharedFlow: (data: { name: string; description?: string }) =>
    request<SharedFlow>('/sharedflows', { method: 'POST', body: JSON.stringify(data) }),
  saveSharedFlow: (id: string, data: Partial<SharedFlow>) =>
    request<SharedFlow>(`/sharedflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSharedFlow: (id: string) => request<void>(`/sharedflows/${id}`, { method: 'DELETE' }),
  duplicateSharedFlow: (id: string) => request<SharedFlow>(`/sharedflows/${id}/duplicate`, { method: 'POST' }),

  previewSharedFlowBundle: (sharedFlow: SharedFlow) =>
    request<{ files: Record<string, string> }>('/sharedflow-bundle/preview', {
      method: 'POST',
      body: JSON.stringify({ sharedFlow }),
    }),

  lintSharedFlowBundle: (sharedFlow: SharedFlow) =>
    request<LintResult>('/sharedflow-bundle/lint', {
      method: 'POST',
      body: JSON.stringify({ sharedFlow }),
    }),

  async exportSharedFlowBundle(sharedFlow: SharedFlow): Promise<void> {
    const res = await loggedFetch(`${BASE}/sharedflow-bundle/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharedFlow }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sharedFlow.name}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export type { Policy };
