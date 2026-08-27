import { create } from 'zustand';
import { nanoid } from '../lib/id';
import { api } from '../api/client';
import { retargetPolicyXmlName, retargetResourcePath, renameResourceFile } from '../lib/policyXml';
import {
  basenameOfPath,
  linkResourceIntoPolicyXml,
  policyReferencesResource,
  referencedResourcePaths,
  setPrimaryResource,
  unlinkResourceFromPolicyXml,
} from '../lib/resourceTypes';
import { suggestPolicyName } from '../lib/policyNames';
import { getPolicySuggestions, type PolicySuggestion } from '../lib/policySuggestions';
import { createUndoHistory, type UndoSlice } from './undoHistory';
import type {
  BundleResource,
  EnvironmentTargetOverride,
  FaultRule,
  FaultRules,
  Flow,
  HistorySnapshotSummary,
  LintResult,
  Policy,
  PolicyChainMeta,
  PolicyChainStepPhase,
  Prerequisite,
  Proxy,
  ProxyEnvironment,
  ProxySummary,
  PolicyTypeMeta,
  RouteRule,
  Step,
  Target,
  Template,
  TestCase,
  TestRunResult,
} from '../types/proxy';

/**
 * How a newly added policy gets the resource file it runs: reuse a file already
 * in the bundle, or create one (at `path`, or the type's default when blank).
 * Only meaningful for policy types that have a resource at all.
 */
export type PolicyResourceChoice =
  | { mode: 'existing'; resourceId: string }
  | { mode: 'new'; path: string };

export type TabKey =
  | 'overview'
  | 'proxyEndpoint'
  | 'targetEndpoint'
  | 'flowDiagram'
  | 'policies'
  | 'resources'
  | 'tests'
  | 'lint'
  | 'preview';

interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface StoreState extends UndoSlice {
  proxies: ProxySummary[];
  templates: Template[];
  policyTypes: PolicyTypeMeta[];
  policyChains: PolicyChainMeta[];
  currentProxy: Proxy | null;
  dirty: boolean;
  saving: boolean;
  activeTab: TabKey;
  selectedPolicyId: string | null;
  selectedTargetId: string | null;
  selectedResourceId: string | null;
  toasts: Toast[];
  suggestion: PolicySuggestion[];
  lintResult: LintResult | null;
  linting: boolean;
  prerequisites: Prerequisite[] | null;
  prerequisitesLoading: boolean;
  historyList: HistorySnapshotSummary[];
  historyLoading: boolean;
  selectedEnvironmentId: string | null;
  selectedTestId: string | null;
  /** Test id currently being run, or null — lets the list show a spinner on just that row. */
  testRunningId: string | null;
  /** Last run result per test id, kept across selection changes so the list can show a pass/fail dot per test. */
  testResultsByTestId: Record<string, TestRunResult>;

  bootstrap: () => Promise<void>;
  refreshProxies: () => Promise<void>;
  refreshTemplates: () => Promise<void>;

  openProxy: (id: string) => Promise<void>;
  closeProxy: () => void;
  createProxy: (data: { name: string; basePath?: string; description?: string }) => Promise<void>;
  createFromTemplate: (templateId: string, data: { name: string; basePath?: string }) => Promise<void>;
  deleteProxy: (id: string) => Promise<void>;
  duplicateProxy: (id: string) => Promise<void>;
  importProxy: (file: File) => Promise<void>;
  importCurl: (curl: string) => Promise<void>;
  importOpenApi: (spec: string) => Promise<void>;
  importPostman: (collection: string) => Promise<void>;
  importWsdl: (wsdl: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;

  setActiveTab: (tab: TabKey) => void;
  setSelectedPolicyId: (id: string | null) => void;
  setSelectedTargetId: (id: string | null) => void;
  setSelectedResourceId: (id: string | null) => void;
  setSelectedEnvironmentId: (id: string | null) => void;
  setSelectedTestId: (id: string | null) => void;

  addEnvironment: () => void;
  renameEnvironment: (id: string, name: string) => void;
  removeEnvironment: (id: string) => void;
  setEnvironmentOverride: (envId: string, targetId: string, override: EnvironmentTargetOverride | null) => void;

  patchProxy: (patch: Partial<Proxy>) => void;
  saveProxy: () => Promise<void>;
  runLint: () => Promise<LintResult | null>;
  toggleLintExclude: (ruleId: string) => Promise<void>;
  loadPrerequisites: () => Promise<void>;
  addTest: () => void;
  updateTest: (id: string, patch: Partial<TestCase>) => void;
  removeTest: (id: string) => void;
  duplicateTest: (id: string) => void;
  generateNegativeTests: () => Promise<void>;
  runTest: (test: TestCase) => Promise<void>;
  exportProxy: () => Promise<void>;
  exportDeploySet: () => Promise<void>;
  exportPostman: () => Promise<void>;
  exportOpenApi: (format: 'json' | 'yaml') => Promise<void>;
  saveAsTemplate: (name: string, description: string) => Promise<void>;

  addPolicy: (type: string, name: string, resourceChoice?: PolicyResourceChoice) => Promise<void>;
  addPolicyChain: (chainKey: string) => Promise<void>;
  acceptSuggestion: (type: string) => Promise<void>;
  dismissSuggestion: () => void;
  updatePolicyXml: (policyId: string, xml: string) => void;
  renamePolicy: (policyId: string, name: string) => void;
  removePolicy: (policyId: string) => void;
  duplicatePolicy: (policyId: string) => void;

  /** Returns an error string when `path` is unusable, or null when it's fine to add/rename to. */
  validateResourcePath: (path: string, ignoreResourceId?: string) => string | null;
  addResource: (path: string, content?: string) => void;
  updateResource: (id: string, content: string) => void;
  renameResource: (id: string, path: string) => void;
  deleteResource: (id: string) => void;
  /** Writes the resource's reference element into the policy's XML. */
  linkResourceToPolicy: (resourceId: string, policyId: string) => void;
  unlinkResourceFromPolicy: (resourceId: string, policyId: string) => void;

  /** targetId omitted = the ProxyEndpoint's own conditional flows; provided = that Target's. */
  addFlow: (targetId?: string) => void;
  updateFlow: (id: string, patch: Partial<Flow>, targetId?: string) => void;
  removeFlow: (id: string, targetId?: string) => void;
  moveFlow: (id: string, direction: -1 | 1, targetId?: string) => void;

  /**
   * Conditional <FaultRule>s — same targetId convention as the flow actions
   * above. These are separate from the DefaultFaultRule, whose steps are
   * edited through addStep/removeStep with a 'faultRules' StepLocation.
   */
  addFaultRule: (targetId?: string) => void;
  updateFaultRule: (id: string, patch: Partial<FaultRule>, targetId?: string) => void;
  removeFaultRule: (id: string, targetId?: string) => void;
  moveFaultRule: (id: string, direction: -1 | 1, targetId?: string) => void;

  addStep: (location: StepLocation, policyName: string) => void;
  updateStep: (location: StepLocation, index: number, patch: Partial<Step>) => void;
  removeStep: (location: StepLocation, index: number) => void;
  moveStep: (location: StepLocation, index: number, direction: -1 | 1) => void;

  addTarget: () => void;
  updateTarget: (id: string, patch: Partial<Target>) => void;
  removeTarget: (id: string) => void;

  addRouteRule: () => void;
  updateRouteRule: (id: string, patch: Partial<RouteRule>) => void;
  removeRouteRule: (id: string) => void;

  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

export type StepLocation =
  | { scope: 'preFlow'; phase: 'request' | 'response' }
  | { scope: 'postFlow'; phase: 'request' | 'response' }
  // PostClientFlow and target EventFlow are response-only in Apigee's schema.
  | { scope: 'postClientFlow'; phase: 'response' }
  | { scope: 'flow'; flowId: string; phase: 'request' | 'response' }
  // 'faultRules' is the unconditional DefaultFaultRule; 'faultRule' is one
  // named, conditional <FaultRule>. Two elements, two locations.
  | { scope: 'faultRules'; phase: 'steps' }
  | { scope: 'faultRule'; ruleId: string; phase: 'steps' }
  | { scope: 'targetPreFlow'; targetId: string; phase: 'request' | 'response' }
  | { scope: 'targetPostFlow'; targetId: string; phase: 'request' | 'response' }
  | { scope: 'targetEventFlow'; targetId: string; phase: 'response' }
  | { scope: 'targetFlow'; targetId: string; flowId: string; phase: 'request' | 'response' }
  | { scope: 'targetFaultRules'; targetId: string; phase: 'steps' }
  | { scope: 'targetFaultRule'; targetId: string; ruleId: string; phase: 'steps' };

/** Maps a policy-chain step's declarative phase onto the ProxyEndpoint's own StepLocation shapes. */
function chainStepLocation(phase: PolicyChainStepPhase): StepLocation {
  switch (phase) {
    case 'preFlow-request':
      return { scope: 'preFlow', phase: 'request' };
    case 'preFlow-response':
      return { scope: 'preFlow', phase: 'response' };
    case 'postFlow-request':
      return { scope: 'postFlow', phase: 'request' };
    case 'postFlow-response':
      return { scope: 'postFlow', phase: 'response' };
    case 'faultRules':
      return { scope: 'faultRules', phase: 'steps' };
  }
}

function withMutatedSteps(proxy: Proxy, location: StepLocation, mutate: (steps: Step[]) => Step[]): Proxy {
  if (location.scope === 'preFlow') {
    return { ...proxy, preFlow: { ...proxy.preFlow, [location.phase]: mutate([...proxy.preFlow[location.phase]]) } };
  }
  if (location.scope === 'postFlow') {
    return { ...proxy, postFlow: { ...proxy.postFlow, [location.phase]: mutate([...proxy.postFlow[location.phase]]) } };
  }
  if (location.scope === 'postClientFlow') {
    const current = proxy.postClientFlow ?? { response: [] };
    return { ...proxy, postClientFlow: { response: mutate([...current.response]) } };
  }
  if (location.scope === 'faultRules') {
    return { ...proxy, faultRules: { ...proxy.faultRules, steps: mutate([...proxy.faultRules.steps]) } };
  }
  if (location.scope === 'faultRule') {
    return {
      ...proxy,
      faultRules: {
        ...proxy.faultRules,
        rules: (proxy.faultRules.rules ?? []).map((r) =>
          r.id === location.ruleId ? { ...r, steps: mutate([...r.steps]) } : r
        ),
      },
    };
  }
  if (location.scope === 'flow') {
    return {
      ...proxy,
      flows: proxy.flows.map((f) =>
        f.id === location.flowId ? { ...f, [location.phase]: mutate([...f[location.phase]]) } : f
      ),
    };
  }
  // Target-scoped locations
  return {
    ...proxy,
    targets: proxy.targets.map((t) => {
      if (t.id !== location.targetId) return t;
      if (location.scope === 'targetPreFlow') {
        return { ...t, preFlow: { ...t.preFlow, [location.phase]: mutate([...t.preFlow[location.phase]]) } };
      }
      if (location.scope === 'targetPostFlow') {
        return { ...t, postFlow: { ...t.postFlow, [location.phase]: mutate([...t.postFlow[location.phase]]) } };
      }
      if (location.scope === 'targetEventFlow') {
        const current = t.eventFlow ?? { contentType: 'text/event-stream', response: [] };
        return { ...t, eventFlow: { ...current, response: mutate([...current.response]) } };
      }
      if (location.scope === 'targetFaultRules') {
        return { ...t, faultRules: { ...t.faultRules, steps: mutate([...t.faultRules.steps]) } };
      }
      if (location.scope === 'targetFaultRule') {
        return {
          ...t,
          faultRules: {
            ...t.faultRules,
            rules: (t.faultRules.rules ?? []).map((r) =>
              r.id === location.ruleId ? { ...r, steps: mutate([...r.steps]) } : r
            ),
          },
        };
      }
      // targetFlow
      return {
        ...t,
        flows: t.flows.map((f) =>
          f.id === location.flowId ? { ...f, [location.phase]: mutate([...f[location.phase]]) } : f
        ),
      };
    }),
  };
}

/**
 * Applies `mutate` to the conditional-FaultRule list of either the
 * ProxyEndpoint (no targetId) or one Target. All four fault-rule actions
 * differ only in what `mutate` does, so they all route through here.
 */
function withFaultRules(proxy: Proxy, targetId: string | undefined, mutate: (rules: FaultRule[]) => FaultRule[]): Proxy {
  if (!targetId) {
    return { ...proxy, faultRules: { ...proxy.faultRules, rules: mutate(proxy.faultRules.rules ?? []) } };
  }
  return {
    ...proxy,
    targets: proxy.targets.map((t) =>
      t.id === targetId ? { ...t, faultRules: { ...t.faultRules, rules: mutate(t.faultRules.rules ?? []) } } : t
    ),
  };
}

// Shared by every "external artifact -> proxy" import action (zip, curl,
// OpenAPI): open the freshly-imported proxy, refresh the sidebar list, and
// surface a success toast followed by any importer-reported warnings.
async function openImportedProxy(
  set: (partial: Partial<StoreState>) => void,
  get: () => StoreState,
  proxy: Proxy,
  warnings: string[],
  successMessage: string
) {
  await get().refreshProxies();
  set({
    currentProxy: proxy,
    dirty: false,
    activeTab: 'overview',
    selectedPolicyId: null,
    selectedTargetId: proxy.targets[0]?.id ?? null,
    lintResult: null,
    prerequisites: null,
    historyList: [],
    selectedEnvironmentId: null,
    selectedTestId: null,
    testResultsByTestId: {},
    selectedResourceId: null,
  });
  get().pushToast(successMessage, 'success');
  warnings.forEach((w) => get().pushToast(w, 'info'));
}

function makeBlankTest(name: string): TestCase {
  return {
    id: nanoid(),
    name,
    request: { verb: 'GET', pathSuffix: '/', headers: {}, queryParams: {}, body: '' },
    mockTargetResponse: { status: 200, headers: {}, body: '' },
    assertions: [],
  };
}

// Starts with no condition, which in Apigee means "always matches". That's the
// safe default for a brand-new rule: it fires rather than silently never
// running, and the condition field is right there to narrow it.
function makeBlankFaultRule(name: string): FaultRule {
  return { id: nanoid(), name, condition: '', steps: [] };
}

function makeBlankFlow(name: string): Flow {
  return {
    id: nanoid(),
    name,
    description: '',
    condition: '',
    conditionMode: 'simple',
    pathValue: '',
    pathOperator: 'MatchesPath',
    verb: 'ANY',
    request: [],
    response: [],
  };
}

export const useStore = create<StoreState>((rawSet, get) => {
  // Wraps `set` so every edit that dirties the proxy becomes an undo step —
  // see undoHistory.ts for why that needs no cooperation from the actions below.
  const history = createUndoHistory<StoreState, 'currentProxy'>({
    docKey: 'currentProxy',
    idOf: (proxy) => proxy.id,
    rawSet,
    get,
  });
  const set = history.set;

  return {
    ...history.slice,

    proxies: [],
    templates: [],
    policyTypes: [],
    policyChains: [],
    currentProxy: null,
    dirty: false,
    saving: false,
    activeTab: 'overview',
    selectedPolicyId: null,
    selectedTargetId: null,
    selectedResourceId: null,
    toasts: [],
    suggestion: [],
    lintResult: null,
    linting: false,
    prerequisites: null,
    prerequisitesLoading: false,
    historyList: [],
    historyLoading: false,
    selectedTestId: null,
    testRunningId: null,
    testResultsByTestId: {},
    selectedEnvironmentId: null,

    async bootstrap() {
      await Promise.all([
        get().refreshProxies(),
        get().refreshTemplates(),
        (async () => {
          const policyTypes = await api.listPolicyTypes();
          set({ policyTypes });
        })(),
        (async () => {
          const policyChains = await api.listPolicyChains();
          set({ policyChains });
        })(),
      ]);
    },

    async refreshProxies() {
      const proxies = await api.listProxies();
      set({ proxies });
    },

    async refreshTemplates() {
      const templates = await api.listTemplates();
      set({ templates });
    },

    async openProxy(id) {
      const proxy = await api.getProxy(id);
      set({
        currentProxy: proxy,
        dirty: false,
        activeTab: 'overview',
        selectedPolicyId: null,
        selectedTargetId: proxy.targets[0]?.id ?? null,
        lintResult: null,
        prerequisites: null,
        historyList: [],
        selectedEnvironmentId: null,
        selectedTestId: null,
        testResultsByTestId: {},
        suggestion: [],
        selectedResourceId: null,
      });
    },

    closeProxy() {
      set({
        currentProxy: null,
        dirty: false,
        selectedPolicyId: null,
        selectedTargetId: null,
        lintResult: null,
        prerequisites: null,
        historyList: [],
        selectedEnvironmentId: null,
        selectedTestId: null,
        testResultsByTestId: {},
        suggestion: [],
        selectedResourceId: null,
      });
    },

    async createProxy(data) {
      const proxy = await api.createProxy(data);
      await get().refreshProxies();
      set({
        currentProxy: proxy,
        dirty: false,
        activeTab: 'overview',
        selectedPolicyId: null,
        selectedTargetId: proxy.targets[0]?.id ?? null,
        lintResult: null,
        prerequisites: null,
        historyList: [],
        selectedEnvironmentId: null,
        selectedTestId: null,
        testResultsByTestId: {},
        suggestion: [],
        selectedResourceId: null,
      });
      get().pushToast(`Proxy "${proxy.name}" created`, 'success');
    },

    async createFromTemplate(templateId, data) {
      const proxy = await api.useTemplate(templateId, data);
      await get().refreshProxies();
      set({
        currentProxy: proxy,
        dirty: false,
        activeTab: 'overview',
        selectedPolicyId: null,
        selectedTargetId: proxy.targets[0]?.id ?? null,
        lintResult: null,
        prerequisites: null,
        historyList: [],
        selectedEnvironmentId: null,
        selectedTestId: null,
        testResultsByTestId: {},
        suggestion: [],
        selectedResourceId: null,
      });
      get().pushToast(`Proxy "${proxy.name}" created from template`, 'success');
    },

    async deleteProxy(id) {
      await api.deleteProxy(id);
      if (get().currentProxy?.id === id) set({ currentProxy: null });
      await get().refreshProxies();
      get().pushToast('Proxy deleted', 'info');
    },

    async duplicateProxy(id) {
      try {
        const duplicated = await api.duplicateProxy(id);
        await get().refreshProxies();
        get().pushToast(`Duplicated as "${duplicated.name}"`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async importProxy(file) {
      try {
        const { proxy, warnings } = await api.importProxyZip(file);
        await openImportedProxy(set, get, proxy, warnings, `Imported "${proxy.name}"`);
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async importCurl(curl) {
      try {
        const { proxy, warnings } = await api.importCurl(curl);
        await openImportedProxy(set, get, proxy, warnings, `Scaffolded "${proxy.name}" from your curl command`);
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async importOpenApi(spec) {
      try {
        const { proxy, warnings } = await api.importOpenApi(spec);
        await openImportedProxy(set, get, proxy, warnings, `Imported "${proxy.name}" from the OpenAPI spec`);
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async importPostman(collection) {
      try {
        const { proxy, warnings } = await api.importPostman(collection);
        await openImportedProxy(set, get, proxy, warnings, `Imported "${proxy.name}" from the Postman collection`);
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async importWsdl(wsdl) {
      try {
        const { proxy, warnings } = await api.importWsdl(wsdl);
        await openImportedProxy(set, get, proxy, warnings, `Imported "${proxy.name}" from the WSDL`);
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async loadHistory() {
      const current = get().currentProxy;
      if (!current) return;
      set({ historyLoading: true });
      try {
        const historyList = await api.listProxyHistory(current.id);
        set({ historyList, historyLoading: false });
      } catch (err) {
        set({ historyLoading: false });
        get().pushToast((err as Error).message, 'error');
      }
    },

    async restoreSnapshot(snapshotId) {
      const current = get().currentProxy;
      if (!current) return;
      try {
        const restored = await api.restoreProxyHistory(current.id, snapshotId);
        set({ currentProxy: restored, dirty: false, lintResult: null, prerequisites: null, selectedTestId: null, testResultsByTestId: {} });
        // Same proxy id, wholly different content: the undo stack describes a
        // timeline this restore just left, so drop it rather than let Undo
        // silently revert the restore.
        get().clearUndoHistory();
        await get().refreshProxies();
        await get().loadHistory();
        get().pushToast('Restored from history', 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    setActiveTab(tab) {
      set({ activeTab: tab });
    },
    setSelectedPolicyId(id) {
      set({ selectedPolicyId: id });
    },
    setSelectedTargetId(id) {
      set({ selectedTargetId: id });
    },
    setSelectedResourceId(id) {
      set({ selectedResourceId: id });
    },
    setSelectedEnvironmentId(id) {
      set({ selectedEnvironmentId: id });
    },
    setSelectedTestId(id) {
      set({ selectedTestId: id });
    },

    addEnvironment() {
      const current = get().currentProxy;
      if (!current) return;
      const env: ProxyEnvironment = {
        id: nanoid(),
        name: `env-${current.environments.length + 1}`,
        targetOverrides: {},
      };
      set({ currentProxy: { ...current, environments: [...current.environments, env] }, dirty: true });
    },

    renameEnvironment(id, name) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: {
          ...current,
          environments: current.environments.map((e) => (e.id === id ? { ...e, name } : e)),
        },
        dirty: true,
      });
    },

    removeEnvironment(id) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: { ...current, environments: current.environments.filter((e) => e.id !== id) },
        dirty: true,
        selectedEnvironmentId: get().selectedEnvironmentId === id ? null : get().selectedEnvironmentId,
      });
    },

    setEnvironmentOverride(envId, targetId, override) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: {
          ...current,
          environments: current.environments.map((e) => {
            if (e.id !== envId) return e;
            const targetOverrides = { ...e.targetOverrides };
            if (override) {
              targetOverrides[targetId] = { ...targetOverrides[targetId], ...override };
            } else {
              delete targetOverrides[targetId];
            }
            return { ...e, targetOverrides };
          }),
        },
        dirty: true,
      });
    },

    patchProxy(patch) {
      const current = get().currentProxy;
      if (!current) return;
      set({ currentProxy: { ...current, ...patch }, dirty: true });
    },

    async saveProxy() {
      const current = get().currentProxy;
      if (!current) return;
      set({ saving: true });
      try {
        const saved = await api.saveProxy(current.id, current);
        set({ currentProxy: saved, dirty: false, saving: false });
        await get().refreshProxies();
        get().pushToast('Saved', 'success');
      } catch (err) {
        set({ saving: false });
        get().pushToast((err as Error).message, 'error');
      }
    },

    async runLint() {
      const current = get().currentProxy;
      if (!current) return null;
      set({ linting: true });
      try {
        const result = await api.lintBundle(current, get().selectedEnvironmentId);
        set({ lintResult: result, linting: false });
        return result;
      } catch (err) {
        set({ linting: false });
        get().pushToast((err as Error).message, 'error');
        return null;
      }
    },

    async toggleLintExclude(ruleId) {
      const current = get().currentProxy;
      if (!current) return;
      const excluded = current.lintExcludes.includes(ruleId);
      const lintExcludes = excluded ? current.lintExcludes.filter((r) => r !== ruleId) : [...current.lintExcludes, ruleId];
      set({ currentProxy: { ...current, lintExcludes }, dirty: true });
      get().pushToast(excluded ? `Re-enabled ${ruleId}` : `Excluded ${ruleId} from lint`, 'info');
      await get().runLint();
    },

    async loadPrerequisites() {
      const current = get().currentProxy;
      if (!current) return;
      set({ prerequisitesLoading: true });
      try {
        const { items } = await api.getPrerequisites(current, get().selectedEnvironmentId);
        set({ prerequisites: items, prerequisitesLoading: false });
      } catch (err) {
        set({ prerequisitesLoading: false });
        get().pushToast((err as Error).message, 'error');
      }
    },

    addTest() {
      const current = get().currentProxy;
      if (!current) return;
      const test = makeBlankTest(`Test ${current.tests.length + 1}`);
      set({ currentProxy: { ...current, tests: [...current.tests, test] }, dirty: true, selectedTestId: test.id });
    },

    updateTest(id, patch) {
      const current = get().currentProxy;
      if (!current) return;
      // Any hand-edit un-marks a generated test, so a later "Generate negative
      // tests" replaces only the ones still untouched rather than clobbering
      // a fix the user already made.
      set({
        currentProxy: {
          ...current,
          tests: current.tests.map((t) => (t.id === id ? { ...t, ...patch, generated: false } : t)),
        },
        dirty: true,
      });
    },

    removeTest(id) {
      const current = get().currentProxy;
      if (!current) return;
      const wasSelected = get().selectedTestId === id;
      const testResultsByTestId = Object.fromEntries(Object.entries(get().testResultsByTestId).filter(([k]) => k !== id));
      set({
        currentProxy: { ...current, tests: current.tests.filter((t) => t.id !== id) },
        dirty: true,
        selectedTestId: wasSelected ? null : get().selectedTestId,
        testResultsByTestId,
      });
    },

    duplicateTest(id) {
      const current = get().currentProxy;
      if (!current) return;
      const source = current.tests.find((t) => t.id === id);
      if (!source) return;
      const duplicate: TestCase = { ...source, id: nanoid(), name: `${source.name}-copy`, generated: false };
      set({ currentProxy: { ...current, tests: [...current.tests, duplicate] }, dirty: true, selectedTestId: duplicate.id });
    },

    async generateNegativeTests() {
      const current = get().currentProxy;
      if (!current) return;
      try {
        const { tests: generated } = await api.generateNegativeTests(current);
        const handWritten = current.tests.filter((t) => !t.generated);
        set({ currentProxy: { ...current, tests: [...handWritten, ...generated] }, dirty: true });
        get().pushToast(`Generated ${generated.length} negative test${generated.length === 1 ? '' : 's'}`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async runTest(test) {
      const current = get().currentProxy;
      if (!current) return;
      set({ testRunningId: test.id });
      try {
        const result = await api.runProxyTest(
          current,
          { request: test.request, mockTargetResponse: test.mockTargetResponse, initialState: test.initialState },
          get().selectedEnvironmentId
        );
        set({ testResultsByTestId: { ...get().testResultsByTestId, [test.id]: result }, testRunningId: null });
      } catch (err) {
        set({ testRunningId: null });
        get().pushToast((err as Error).message, 'error');
      }
    },

    // Export is gated on apigeelint: zero errors required, warnings are fine —
    // the same bar most CI/CD pipelines hold a bundle to before deploy.
    async exportProxy() {
      const current = get().currentProxy;
      if (!current) return;

      const result = await get().runLint();
      // runLint returns null when the lint request itself failed. Treat that as a
      // hard stop rather than falling through: the whole point of the gate is that
      // a bundle nobody verified never becomes a zip you try to deploy.
      if (!result) {
        get().pushToast('Export blocked — the lint check could not be run, so the bundle is unverified.', 'error');
        return;
      }
      if (result.errorCount > 0) {
        get().pushToast(
          `Export blocked — ${result.errorCount} error${result.errorCount === 1 ? '' : 's'} found. See the Lint tab.`,
          'error'
        );
        set({ activeTab: 'lint' });
        return;
      }
      if (!result.ok) {
        get().pushToast('apigeelint could not run — exporting without lint verification.', 'error');
      }

      try {
        await api.exportBundle(current, get().selectedEnvironmentId);
        const env = current.environments.find((e) => e.id === get().selectedEnvironmentId);
        get().pushToast(`Exported ${current.name}${env ? `-${env.name}` : ''}.zip`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    // Convenience packaging, not the artifact of record — skips the lint gate
    // the same way Postman/OpenAPI export does. exportProxy remains the one true
    // "is this safe to hand to Apigee" gate.
    async exportDeploySet() {
      const current = get().currentProxy;
      if (!current) return;
      try {
        await api.exportDeploySet(current, get().selectedEnvironmentId);
        get().pushToast(`Exported ${current.name}-deploy-set.zip`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    // Postman/OpenAPI exports are documentation/testing artifacts, not deploy
    // bundles — they skip the lint gate `exportProxy` enforces since there's
    // nothing to deploy and a lint error shouldn't block writing a test collection.
    async exportPostman() {
      const current = get().currentProxy;
      if (!current) return;
      try {
        await api.exportPostmanCollection(current);
        get().pushToast(`Exported ${current.name}.postman_collection.json`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async exportOpenApi(format) {
      const current = get().currentProxy;
      if (!current) return;
      try {
        await api.exportOpenApiSpec(current, format);
        get().pushToast(`Exported ${current.name}.openapi.${format}`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async saveAsTemplate(name, description) {
      const current = get().currentProxy;
      if (!current) return;
      await api.saveAsTemplate({ name, description, proxy: current });
      await get().refreshTemplates();
      get().pushToast(`Saved as template "${name}"`, 'success');
    },

    async addPolicy(type, name, resourceChoice) {
      const current = get().currentProxy;
      if (!current) return;
      if (current.policies.some((p) => p.name === name)) {
        get().pushToast(`A policy named "${name}" already exists`, 'error');
        return;
      }
      try {
        const { xml, resource } = await api.getPolicyDefaults(type, name);
        let policyXml = xml;
        let newResource: BundleResource | null = null;

        if (resource) {
          // This policy type runs a resource file. Either point it at a file that
          // already exists, or create one — the type default's own path
          // (jsc://<PolicyName>.js) is just the fallback when the caller says
          // nothing, and the XML reference is retargeted either way so it can
          // never dangle.
          if (resourceChoice?.mode === 'existing') {
            const existing = current.resources.find((r) => r.id === resourceChoice.resourceId);
            if (!existing) {
              get().pushToast('That resource file no longer exists.', 'error');
              return;
            }
            policyXml = setPrimaryResource(xml, existing.path);
          } else {
            const path =
              resourceChoice?.mode === 'new' && resourceChoice.path.trim() ? resourceChoice.path.trim() : resource.path;
            const pathError = get().validateResourcePath(path);
            if (pathError) {
              get().pushToast(pathError, 'error');
              return;
            }
            policyXml = setPrimaryResource(xml, path);
            newResource = { id: nanoid(), path, content: resource.content };
          }
        }

        const policy: Policy = { id: nanoid(), name, type, xml: policyXml };
        const updatedPolicies = [...current.policies, policy];
        set({
          currentProxy: {
            ...current,
            policies: updatedPolicies,
            resources: newResource ? [...current.resources, newResource] : current.resources,
          },
          dirty: true,
          selectedPolicyId: policy.id,
          activeTab: 'policies',
          suggestion: getPolicySuggestions(type, updatedPolicies.map((p) => p.type)),
        });
        get().pushToast(
          newResource ? `Added policy "${name}" and ${basenameOfPath(newResource.path)}` : `Added policy "${name}"`,
          'success'
        );
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    async acceptSuggestion(type) {
      const current = get().currentProxy;
      if (!current) return;
      await get().addPolicy(type, suggestPolicyName(type, current.policies));
    },

    dismissSuggestion() {
      set({ suggestion: [] });
    },

    async addPolicyChain(chainKey) {
      const chain = get().policyChains.find((c) => c.key === chainKey);
      const current = get().currentProxy;
      if (!chain || !current) return;
      try {
        // Names must be decided up front (each new one avoiding the last) since
        // they're all created before any is persisted.
        const runningNames: Pick<Policy, 'type' | 'name'>[] = [...current.policies];
        const namedSteps = chain.steps.map((step) => {
          const name = suggestPolicyName(step.type, runningNames);
          runningNames.push({ type: step.type, name });
          return { ...step, name };
        });

        const defaults = await Promise.all(namedSteps.map((s) => api.getPolicyDefaults(s.type, s.name)));
        const newPolicies: Policy[] = namedSteps.map((s, i) => ({
          id: nanoid(),
          name: s.name,
          type: s.type,
          xml: defaults[i].xml,
        }));
        // A chain is added wholesale with no per-policy prompting, so any policy
        // in it that runs a resource file gets that file at the type's default
        // path — editable afterwards on the Resources tab.
        const newResources: BundleResource[] = defaults
          .filter((d) => d.resource)
          .map((d) => ({ id: nanoid(), path: d.resource!.path, content: d.resource!.content }));

        set({
          currentProxy: {
            ...get().currentProxy!,
            policies: [...get().currentProxy!.policies, ...newPolicies],
            resources: [...get().currentProxy!.resources, ...newResources],
          },
          dirty: true,
        });
        for (const step of namedSteps) {
          get().addStep(chainStepLocation(step.phase), step.name);
        }

        set({ selectedPolicyId: newPolicies[newPolicies.length - 1]?.id ?? null, activeTab: 'policies', suggestion: [] });
        get().pushToast(`Added chain "${chain.label}" — ${newPolicies.length} policies wired in`, 'success');
      } catch (err) {
        get().pushToast((err as Error).message, 'error');
      }
    },

    updatePolicyXml(policyId, xml) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: { ...current, policies: current.policies.map((p) => (p.id === policyId ? { ...p, xml } : p)) },
        dirty: true,
      });
    },

    renamePolicy(policyId, name) {
      const current = get().currentProxy;
      if (!current) return;
      const old = current.policies.find((p) => p.id === policyId);
      if (!old) return;
      const oldName = old.name;
      const renameStep = (s: Step) => (s.policyName === oldName ? { ...s, policyName: name } : s);
      const renameInFlow = (f: Flow) => ({ ...f, request: f.request.map(renameStep), response: f.response.map(renameStep) });
      // Both halves: the DefaultFaultRule's steps and every conditional rule's.
      const renameInFaultRules = (fr: FaultRules): FaultRules => ({
        steps: fr.steps.map(renameStep),
        rules: (fr.rules ?? []).map((r) => ({ ...r, steps: r.steps.map(renameStep) })),
      });
      set({
        currentProxy: {
          ...current,
          // Resource files are NOT renamed along with the policy: a file can be
          // shared by several policies now, so following one policy's name would
          // break the others. The XML's reference is left pointing at the same
          // existing file, which stays valid.
          policies: current.policies.map((p) =>
            p.id === policyId ? { ...p, name, xml: retargetPolicyXmlName(p.xml, oldName, name) } : p
          ),
          preFlow: { request: current.preFlow.request.map(renameStep), response: current.preFlow.response.map(renameStep) },
          postFlow: { request: current.postFlow.request.map(renameStep), response: current.postFlow.response.map(renameStep) },
          flows: current.flows.map(renameInFlow),
          faultRules: renameInFaultRules(current.faultRules),
          targets: current.targets.map((t) => ({
            ...t,
            preFlow: { request: t.preFlow.request.map(renameStep), response: t.preFlow.response.map(renameStep) },
            postFlow: { request: t.postFlow.request.map(renameStep), response: t.postFlow.response.map(renameStep) },
            flows: t.flows.map(renameInFlow),
            faultRules: renameInFaultRules(t.faultRules),
          })),
        },
        dirty: true,
      });
    },

    duplicatePolicy(policyId) {
      const current = get().currentProxy;
      if (!current) return;
      const source = current.policies.find((p) => p.id === policyId);
      if (!source) return;

      let newName = `${source.name}-copy`;
      let suffix = 2;
      while (current.policies.some((p) => p.name === newName)) {
        newName = `${source.name}-copy-${suffix++}`;
      }

      let xml = retargetPolicyXmlName(source.xml, source.name, newName);

      // Copy the resource files this policy alone uses, so editing the copy's
      // script doesn't change the original's. A file referenced by more than one
      // policy is genuinely shared (a jsc helper included in several places) and
      // stays shared — copying it would be the wrong call there.
      const allPaths = current.resources.map((r) => r.path);
      const copiedResources: BundleResource[] = [];
      for (const path of referencedResourcePaths(source.xml, allPaths)) {
        const usedByOthers = current.policies.some((p) => p.id !== source.id && policyReferencesResource(p.xml, path));
        if (usedByOthers) continue;
        const original = current.resources.find((r) => r.path === path)!;
        const copyPath = retargetResourcePath(path, newName);
        if (current.resources.some((r) => r.path === copyPath)) continue;
        const renamed = renameResourceFile(xml, path, basenameOfPath(copyPath));
        xml = renamed.xml;
        copiedResources.push({ id: nanoid(), path: copyPath, content: original.content });
      }

      const duplicate: Policy = { id: nanoid(), name: newName, type: source.type, xml };

      set({
        currentProxy: {
          ...current,
          policies: [...current.policies, duplicate],
          resources: [...current.resources, ...copiedResources],
        },
        dirty: true,
        selectedPolicyId: duplicate.id,
      });
      get().pushToast(
        copiedResources.length
          ? `Duplicated as "${newName}" with ${copiedResources.length} resource file${copiedResources.length === 1 ? '' : 's'}`
          : `Duplicated as "${newName}"`,
        'success'
      );
    },

    removePolicy(policyId) {
      const current = get().currentProxy;
      if (!current) return;
      const policy = current.policies.find((p) => p.id === policyId);
      if (!policy) return;
      const stripStep = (steps: Step[]) => steps.filter((s) => s.policyName !== policy.name);
      const stripInFlow = (f: Flow) => ({ ...f, request: stripStep(f.request), response: stripStep(f.response) });
      const stripInFaultRules = (fr: FaultRules): FaultRules => ({
        steps: stripStep(fr.steps),
        rules: (fr.rules ?? []).map((r) => ({ ...r, steps: stripStep(r.steps) })),
      });
      set({
        currentProxy: {
          ...current,
          policies: current.policies.filter((p) => p.id !== policyId),
          preFlow: { request: stripStep(current.preFlow.request), response: stripStep(current.preFlow.response) },
          postFlow: { request: stripStep(current.postFlow.request), response: stripStep(current.postFlow.response) },
          flows: current.flows.map(stripInFlow),
          faultRules: stripInFaultRules(current.faultRules),
          targets: current.targets.map((t) => ({
            ...t,
            preFlow: { request: stripStep(t.preFlow.request), response: stripStep(t.preFlow.response) },
            postFlow: { request: stripStep(t.postFlow.request), response: stripStep(t.postFlow.response) },
            flows: t.flows.map(stripInFlow),
            faultRules: stripInFaultRules(t.faultRules),
          })),
        },
        dirty: true,
        selectedPolicyId: get().selectedPolicyId === policyId ? null : get().selectedPolicyId,
      });
    },

    validateResourcePath(path, ignoreResourceId) {
      const current = get().currentProxy;
      if (!current) return 'No proxy open.';
      const trimmed = path.trim();
      if (!trimmed.startsWith('resources/')) return 'Path must start with "resources/".';
      const segments = trimmed.split('/');
      // resources/<type>/<...basename> — at least a type folder and a filename.
      if (segments.length < 3 || !segments[1] || !segments[2]) {
        return 'Path must look like "resources/<type>/<filename>", e.g. "resources/jsc/utils.js".';
      }
      if (segments.some((s) => s === '..' || s === '.')) return 'Path may not contain "." or "..".';
      const duplicate = current.resources.some((r) => r.path === trimmed && r.id !== ignoreResourceId);
      if (duplicate) return `A resource at "${trimmed}" already exists.`;
      return null;
    },

    addResource(path, content = '') {
      const current = get().currentProxy;
      if (!current) return;
      const error = get().validateResourcePath(path);
      if (error) {
        get().pushToast(error, 'error');
        return;
      }
      const resource: BundleResource = { id: nanoid(), path: path.trim(), content };
      set({
        currentProxy: { ...current, resources: [...current.resources, resource] },
        dirty: true,
        selectedResourceId: resource.id,
        activeTab: 'resources',
      });
    },

    updateResource(id, content) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: { ...current, resources: current.resources.map((r) => (r.id === id ? { ...r, content } : r)) },
        dirty: true,
      });
    },

    renameResource(id, path) {
      const current = get().currentProxy;
      if (!current) return;
      const error = get().validateResourcePath(path, id);
      if (error) {
        get().pushToast(error, 'error');
        return;
      }
      set({
        currentProxy: { ...current, resources: current.resources.map((r) => (r.id === id ? { ...r, path: path.trim() } : r)) },
        dirty: true,
      });
    },

    deleteResource(id) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: { ...current, resources: current.resources.filter((r) => r.id !== id) },
        dirty: true,
        selectedResourceId: get().selectedResourceId === id ? null : get().selectedResourceId,
      });
    },

    linkResourceToPolicy(resourceId, policyId) {
      const current = get().currentProxy;
      if (!current) return;
      const resource = current.resources.find((r) => r.id === resourceId);
      const policy = current.policies.find((p) => p.id === policyId);
      if (!resource || !policy) return;

      const xml = linkResourceIntoPolicyXml(policy.xml, resource.path);
      if (xml === policy.xml) {
        // Either already linked, or the XML's root element couldn't be found —
        // saying nothing changed is better than a toast claiming success.
        get().pushToast(`"${policy.name}" already references this file (or its XML couldn't be edited automatically).`, 'info');
        return;
      }
      set({
        currentProxy: { ...current, policies: current.policies.map((p) => (p.id === policyId ? { ...p, xml } : p)) },
        dirty: true,
      });
      get().pushToast(`Linked ${resource.path.split('/').pop()} to "${policy.name}"`, 'success');
    },

    unlinkResourceFromPolicy(resourceId, policyId) {
      const current = get().currentProxy;
      if (!current) return;
      const resource = current.resources.find((r) => r.id === resourceId);
      const policy = current.policies.find((p) => p.id === policyId);
      if (!resource || !policy) return;

      const xml = unlinkResourceFromPolicyXml(policy.xml, resource.path);
      if (xml === policy.xml) {
        get().pushToast(`Couldn't remove that reference automatically — edit "${policy.name}" on the Policies tab.`, 'info');
        return;
      }
      set({
        currentProxy: { ...current, policies: current.policies.map((p) => (p.id === policyId ? { ...p, xml } : p)) },
        dirty: true,
      });
      get().pushToast(`Unlinked from "${policy.name}"`, 'success');
    },

    addFlow(targetId) {
      const current = get().currentProxy;
      if (!current) return;
      if (!targetId) {
        const flow = makeBlankFlow(`Flow-${current.flows.length + 1}`);
        set({ currentProxy: { ...current, flows: [...current.flows, flow] }, dirty: true });
        return;
      }
      set({
        currentProxy: {
          ...current,
          targets: current.targets.map((t) =>
            t.id === targetId ? { ...t, flows: [...t.flows, makeBlankFlow(`Flow-${t.flows.length + 1}`)] } : t
          ),
        },
        dirty: true,
      });
    },

    updateFlow(id, patch, targetId) {
      const current = get().currentProxy;
      if (!current) return;
      if (!targetId) {
        set({
          currentProxy: { ...current, flows: current.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)) },
          dirty: true,
        });
        return;
      }
      set({
        currentProxy: {
          ...current,
          targets: current.targets.map((t) =>
            t.id === targetId ? { ...t, flows: t.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : t
          ),
        },
        dirty: true,
      });
    },

    removeFlow(id, targetId) {
      const current = get().currentProxy;
      if (!current) return;
      if (!targetId) {
        set({ currentProxy: { ...current, flows: current.flows.filter((f) => f.id !== id) }, dirty: true });
        return;
      }
      set({
        currentProxy: {
          ...current,
          targets: current.targets.map((t) => (t.id === targetId ? { ...t, flows: t.flows.filter((f) => f.id !== id) } : t)),
        },
        dirty: true,
      });
    },

    moveFlow(id, direction, targetId) {
      const current = get().currentProxy;
      if (!current) return;
      const reorder = (flows: Flow[]) => {
        const list = [...flows];
        const idx = list.findIndex((f) => f.id === id);
        const newIdx = idx + direction;
        if (idx < 0 || newIdx < 0 || newIdx >= list.length) return flows;
        [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
        return list;
      };
      if (!targetId) {
        set({ currentProxy: { ...current, flows: reorder(current.flows) }, dirty: true });
        return;
      }
      set({
        currentProxy: {
          ...current,
          targets: current.targets.map((t) => (t.id === targetId ? { ...t, flows: reorder(t.flows) } : t)),
        },
        dirty: true,
      });
    },

    addFaultRule(targetId) {
      const current = get().currentProxy;
      if (!current) return;
      const existing = targetId
        ? current.targets.find((t) => t.id === targetId)?.faultRules.rules
        : current.faultRules.rules;
      const rule = makeBlankFaultRule(`FaultRule-${(existing?.length ?? 0) + 1}`);
      set({ currentProxy: withFaultRules(current, targetId, (rules) => [...rules, rule]), dirty: true });
    },

    updateFaultRule(id, patch, targetId) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: withFaultRules(current, targetId, (rules) =>
          rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
        ),
        dirty: true,
      });
    },

    removeFaultRule(id, targetId) {
      const current = get().currentProxy;
      if (!current) return;
      set({ currentProxy: withFaultRules(current, targetId, (rules) => rules.filter((r) => r.id !== id)), dirty: true });
    },

    moveFaultRule(id, direction, targetId) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: withFaultRules(current, targetId, (rules) => {
          const list = [...rules];
          const idx = list.findIndex((r) => r.id === id);
          const newIdx = idx + direction;
          if (idx < 0 || newIdx < 0 || newIdx >= list.length) return rules;
          [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
          return list;
        }),
        dirty: true,
      });
    },

    addStep(location, policyName) {
      const current = get().currentProxy;
      if (!current) return;
      const updated = withMutatedSteps(current, location, (steps) => [...steps, { policyName }]);
      set({ currentProxy: updated, dirty: true });
    },

    updateStep(location, index, patch) {
      const current = get().currentProxy;
      if (!current) return;
      const updated = withMutatedSteps(current, location, (steps) =>
        steps.map((s, i) => (i === index ? { ...s, ...patch } : s))
      );
      set({ currentProxy: updated, dirty: true });
    },

    removeStep(location, index) {
      const current = get().currentProxy;
      if (!current) return;
      const updated = withMutatedSteps(current, location, (steps) => steps.filter((_, i) => i !== index));
      set({ currentProxy: updated, dirty: true });
    },

    moveStep(location, index, direction) {
      const current = get().currentProxy;
      if (!current) return;
      const updated = withMutatedSteps(current, location, (steps) => {
        const newIdx = index + direction;
        if (newIdx < 0 || newIdx >= steps.length) return steps;
        [steps[index], steps[newIdx]] = [steps[newIdx], steps[index]];
        return steps;
      });
      set({ currentProxy: updated, dirty: true });
    },

    addTarget() {
      const current = get().currentProxy;
      if (!current) return;
      const target: Target = {
        id: nanoid(),
        name: `target-${current.targets.length + 1}`,
        mode: 'url',
        url: { mode: 'literal', value: 'https://' },
        targetServers: [],
        description: '',
        preFlow: { request: [], response: [] },
        postFlow: { request: [], response: [] },
        flows: [],
        faultRules: { rules: [], steps: [] },
      };
      set({ currentProxy: { ...current, targets: [...current.targets, target] }, dirty: true, selectedTargetId: target.id });
    },

    updateTarget(id, patch) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: { ...current, targets: current.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
        dirty: true,
      });
    },

    removeTarget(id) {
      const current = get().currentProxy;
      if (!current) return;
      const targets = current.targets.filter((t) => t.id !== id);
      set({
        currentProxy: { ...current, targets },
        dirty: true,
        selectedTargetId: get().selectedTargetId === id ? targets[0]?.id ?? null : get().selectedTargetId,
      });
    },

    addRouteRule() {
      const current = get().currentProxy;
      if (!current) return;
      const rr: RouteRule = {
        id: nanoid(),
        name: `route-${current.routeRules.length + 1}`,
        targetName: current.targets[0]?.name || 'default',
        condition: '',
      };
      set({ currentProxy: { ...current, routeRules: [...current.routeRules, rr] }, dirty: true });
    },

    updateRouteRule(id, patch) {
      const current = get().currentProxy;
      if (!current) return;
      set({
        currentProxy: { ...current, routeRules: current.routeRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
        dirty: true,
      });
    },

    removeRouteRule(id) {
      const current = get().currentProxy;
      if (!current) return;
      set({ currentProxy: { ...current, routeRules: current.routeRules.filter((r) => r.id !== id) }, dirty: true });
    },

    pushToast(message, tone = 'info') {
      const id = nanoid();
      set({ toasts: [...get().toasts, { id, message, tone }] });
      setTimeout(() => get().dismissToast(id), 3800);
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  };
});
