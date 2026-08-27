import { create } from 'zustand';
import { nanoid } from '../lib/id';
import { api } from '../api/client';
import { retargetPolicyXmlName } from '../lib/policyXml';
import { linkResourceIntoPolicyXml, setPrimaryResource, unlinkResourceFromPolicyXml } from '../lib/resourceTypes';
import type { PolicyResourceChoice } from './useStore';
import { useStore } from './useStore';
import type { BundleResource, LintResult, Policy, Step } from '../types/proxy';
import type { SharedFlow, SharedFlowSummary } from '../types/sharedFlow';
import { createUndoHistory, type UndoSlice } from './undoHistory';

export type SharedFlowTabKey = 'steps' | 'policies' | 'resources' | 'lint' | 'preview';

function notify(message: string, tone: 'success' | 'error' | 'info' = 'info') {
  useStore.getState().pushToast(message, tone);
}

interface SharedFlowStoreState extends UndoSlice {
  sharedFlows: SharedFlowSummary[];
  currentSharedFlow: SharedFlow | null;
  dirty: boolean;
  saving: boolean;
  activeTab: SharedFlowTabKey;
  selectedPolicyId: string | null;
  lintResult: LintResult | null;
  linting: boolean;

  refreshSharedFlows: () => Promise<void>;
  openSharedFlow: (id: string) => Promise<void>;
  closeSharedFlow: () => void;
  createSharedFlow: (data: { name: string; description?: string }) => Promise<void>;
  importSharedFlow: (file: File) => Promise<void>;
  deleteSharedFlow: (id: string) => Promise<void>;
  duplicateSharedFlow: (id: string) => Promise<void>;

  setActiveTab: (tab: SharedFlowTabKey) => void;
  setSelectedPolicyId: (id: string | null) => void;

  patchSharedFlow: (patch: Partial<SharedFlow>) => void;
  saveSharedFlow: () => Promise<void>;
  runLint: () => Promise<LintResult | null>;
  toggleLintExclude: (ruleId: string) => Promise<void>;
  exportSharedFlow: () => Promise<void>;

  addPolicy: (type: string, name: string, resourceChoice?: PolicyResourceChoice) => Promise<void>;
  updatePolicyXml: (policyId: string, xml: string) => void;
  validateResourcePath: (path: string, ignoreResourceId?: string) => string | null;
  addResource: (path: string, content?: string) => void;
  updateResource: (id: string, content: string) => void;
  renameResource: (id: string, path: string) => void;
  deleteResource: (id: string) => void;
  linkResourceToPolicy: (resourceId: string, policyId: string) => void;
  unlinkResourceFromPolicy: (resourceId: string, policyId: string) => void;
  selectedResourceId: string | null;
  setSelectedResourceId: (id: string | null) => void;
  renamePolicy: (policyId: string, name: string) => void;
  removePolicy: (policyId: string) => void;
  duplicatePolicy: (policyId: string) => void;

  addStep: (policyName: string) => void;
  updateStep: (index: number, patch: Partial<Step>) => void;
  removeStep: (index: number) => void;
  moveStep: (index: number, direction: -1 | 1) => void;
}

export const useSharedFlowStore = create<SharedFlowStoreState>((rawSet, get) => {
  // Same wrapping as useStore — see undoHistory.ts.
  const history = createUndoHistory<SharedFlowStoreState, 'currentSharedFlow'>({
    docKey: 'currentSharedFlow',
    idOf: (sharedFlow) => sharedFlow.id,
    rawSet,
    get,
  });
  const set = history.set;

  return {
    ...history.slice,

    sharedFlows: [],
    currentSharedFlow: null,
    dirty: false,
    saving: false,
    activeTab: 'steps',
    selectedResourceId: null,
    selectedPolicyId: null,
    lintResult: null,
    linting: false,

    async refreshSharedFlows() {
      const sharedFlows = await api.listSharedFlows();
      set({ sharedFlows });
    },

    async openSharedFlow(id) {
      const sharedFlow = await api.getSharedFlow(id);
      set({
        currentSharedFlow: sharedFlow,
        dirty: false,
        activeTab: 'steps',
        selectedPolicyId: null,
        lintResult: null,
      });
    },

    closeSharedFlow() {
      set({ currentSharedFlow: null, dirty: false, selectedPolicyId: null, lintResult: null });
    },

    async createSharedFlow(data) {
      try {
        const sharedFlow = await api.createSharedFlow(data);
        await get().refreshSharedFlows();
        set({ currentSharedFlow: sharedFlow, dirty: false, activeTab: 'steps', selectedPolicyId: null, lintResult: null });
        notify(`Shared flow "${sharedFlow.name}" created`, 'success');
      } catch (err) {
        notify((err as Error).message, 'error');
      }
    },

    async importSharedFlow(file) {
      try {
        const { sharedFlow, warnings } = await api.importSharedFlowZip(file);
        await get().refreshSharedFlows();
        set({
          currentSharedFlow: sharedFlow,
          dirty: false,
          activeTab: 'steps',
          selectedPolicyId: null,
          lintResult: null,
        });
        notify(`Imported "${sharedFlow.name}"`, 'success');
        warnings.forEach((w) => notify(w, 'info'));
      } catch (err) {
        notify((err as Error).message, 'error');
      }
    },

    async deleteSharedFlow(id) {
      await api.deleteSharedFlow(id);
      if (get().currentSharedFlow?.id === id) set({ currentSharedFlow: null });
      await get().refreshSharedFlows();
      notify('Shared flow deleted', 'info');
    },

    async duplicateSharedFlow(id) {
      try {
        const duplicated = await api.duplicateSharedFlow(id);
        await get().refreshSharedFlows();
        notify(`Duplicated as "${duplicated.name}"`, 'success');
      } catch (err) {
        notify((err as Error).message, 'error');
      }
    },

    setActiveTab(tab) {
      set({ activeTab: tab });
    },
    setSelectedPolicyId(id) {
      set({ selectedPolicyId: id });
    },

    patchSharedFlow(patch) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({ currentSharedFlow: { ...current, ...patch }, dirty: true });
    },

    async saveSharedFlow() {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({ saving: true });
      try {
        const saved = await api.saveSharedFlow(current.id, current);
        set({ currentSharedFlow: saved, dirty: false, saving: false });
        await get().refreshSharedFlows();
        notify('Saved', 'success');
      } catch (err) {
        set({ saving: false });
        notify((err as Error).message, 'error');
      }
    },

    async runLint() {
      const current = get().currentSharedFlow;
      if (!current) return null;
      set({ linting: true });
      try {
        const result = await api.lintSharedFlowBundle(current);
        set({ lintResult: result, linting: false });
        return result;
      } catch (err) {
        set({ linting: false });
        notify((err as Error).message, 'error');
        return null;
      }
    },

    async toggleLintExclude(ruleId) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const excluded = current.lintExcludes.includes(ruleId);
      const lintExcludes = excluded ? current.lintExcludes.filter((r) => r !== ruleId) : [...current.lintExcludes, ruleId];
      set({ currentSharedFlow: { ...current, lintExcludes }, dirty: true });
      await get().runLint();
    },

    // Export is gated on apigeelint the same way proxy export is: zero errors required, warnings are fine.
    async exportSharedFlow() {
      const current = get().currentSharedFlow;
      if (!current) return;

      const result = await get().runLint();
      // Same reasoning as exportProxy: a null result means the check never ran, so
      // the bundle is unverified and must not become a zip.
      if (!result) {
        notify('Export blocked — the lint check could not be run, so the bundle is unverified.', 'error');
        return;
      }
      if (result.errorCount > 0) {
        notify(`Export blocked — ${result.errorCount} error${result.errorCount === 1 ? '' : 's'} found. See the Lint tab.`, 'error');
        set({ activeTab: 'lint' });
        return;
      }
      if (!result.ok) {
        notify('apigeelint could not run — exporting without lint verification.', 'error');
      }

      try {
        await api.exportSharedFlowBundle(current);
        notify(`Exported ${current.name}.zip`, 'success');
      } catch (err) {
        notify((err as Error).message, 'error');
      }
    },

    async addPolicy(type, name, resourceChoice) {
      const current = get().currentSharedFlow;
      if (!current) return;
      if (current.policies.some((p) => p.name === name)) {
        notify(`A policy named "${name}" already exists`, 'error');
        return;
      }
      try {
        const { xml, resource } = await api.getPolicyDefaults(type, name);
        let policyXml = xml;
        let newResource: BundleResource | null = null;

        // Same contract as the proxy store's addPolicy — see the comment there.
        if (resource) {
          if (resourceChoice?.mode === 'existing') {
            const existing = current.resources.find((r) => r.id === resourceChoice.resourceId);
            if (!existing) {
              notify('That resource file no longer exists.', 'error');
              return;
            }
            policyXml = setPrimaryResource(xml, existing.path);
          } else {
            const path =
              resourceChoice?.mode === 'new' && resourceChoice.path.trim() ? resourceChoice.path.trim() : resource.path;
            const pathError = get().validateResourcePath(path);
            if (pathError) {
              notify(pathError, 'error');
              return;
            }
            policyXml = setPrimaryResource(xml, path);
            newResource = { id: nanoid(), path, content: resource.content };
          }
        }

        const policy: Policy = { id: nanoid(), name, type, xml: policyXml };
        set({
          currentSharedFlow: {
            ...current,
            policies: [...current.policies, policy],
            resources: newResource ? [...current.resources, newResource] : current.resources,
          },
          dirty: true,
          selectedPolicyId: policy.id,
          activeTab: 'policies',
        });
        notify(`Added policy "${name}"`, 'success');
      } catch (err) {
        notify((err as Error).message, 'error');
      }
    },

    updatePolicyXml(policyId, xml) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({
        currentSharedFlow: { ...current, policies: current.policies.map((p) => (p.id === policyId ? { ...p, xml } : p)) },
        dirty: true,
      });
    },

    validateResourcePath(path, ignoreResourceId) {
      const current = get().currentSharedFlow;
      if (!current) return 'No shared flow open.';
      const trimmed = path.trim();
      if (!trimmed.startsWith('resources/')) return 'Path must start with "resources/".';
      const segments = trimmed.split('/');
      if (segments.length < 3 || !segments[1] || !segments[2]) {
        return 'Path must look like "resources/<type>/<filename>", e.g. "resources/jsc/utils.js".';
      }
      if (segments.some((seg) => seg === '..' || seg === '.')) return 'Path may not contain "." or "..".';
      if (current.resources.some((r) => r.path === trimmed && r.id !== ignoreResourceId)) {
        return `A resource at "${trimmed}" already exists.`;
      }
      return null;
    },

    addResource(path, content = '') {
      const current = get().currentSharedFlow;
      if (!current) return;
      const error = get().validateResourcePath(path);
      if (error) return notify(error, 'error');
      const resource: BundleResource = { id: nanoid(), path: path.trim(), content };
      set({
        currentSharedFlow: { ...current, resources: [...current.resources, resource] },
        dirty: true,
        selectedResourceId: resource.id,
        activeTab: 'resources',
      });
    },

    updateResource(id, content) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({
        currentSharedFlow: { ...current, resources: current.resources.map((r) => (r.id === id ? { ...r, content } : r)) },
        dirty: true,
      });
    },

    renameResource(id, path) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const error = get().validateResourcePath(path, id);
      if (error) return notify(error, 'error');
      set({
        currentSharedFlow: {
          ...current,
          resources: current.resources.map((r) => (r.id === id ? { ...r, path: path.trim() } : r)),
        },
        dirty: true,
      });
    },

    deleteResource(id) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({
        currentSharedFlow: { ...current, resources: current.resources.filter((r) => r.id !== id) },
        dirty: true,
        selectedResourceId: get().selectedResourceId === id ? null : get().selectedResourceId,
      });
    },

    linkResourceToPolicy(resourceId, policyId) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const resource = current.resources.find((r) => r.id === resourceId);
      const policy = current.policies.find((p) => p.id === policyId);
      if (!resource || !policy) return;
      const xml = linkResourceIntoPolicyXml(policy.xml, resource.path);
      if (xml === policy.xml) {
        return notify(`"${policy.name}" already references this file (or its XML couldn't be edited automatically).`, 'info');
      }
      set({
        currentSharedFlow: { ...current, policies: current.policies.map((p) => (p.id === policyId ? { ...p, xml } : p)) },
        dirty: true,
      });
      notify(`Linked ${resource.path.split('/').pop()} to "${policy.name}"`, 'success');
    },

    unlinkResourceFromPolicy(resourceId, policyId) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const resource = current.resources.find((r) => r.id === resourceId);
      const policy = current.policies.find((p) => p.id === policyId);
      if (!resource || !policy) return;
      const xml = unlinkResourceFromPolicyXml(policy.xml, resource.path);
      if (xml === policy.xml) {
        return notify(`Couldn't remove that reference automatically — edit "${policy.name}" on the Policies tab.`, 'info');
      }
      set({
        currentSharedFlow: { ...current, policies: current.policies.map((p) => (p.id === policyId ? { ...p, xml } : p)) },
        dirty: true,
      });
      notify(`Unlinked from "${policy.name}"`, 'success');
    },

    setSelectedResourceId(id) {
      set({ selectedResourceId: id });
    },

    renamePolicy(policyId, name) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const old = current.policies.find((p) => p.id === policyId);
      if (!old) return;
      const oldName = old.name;
      const renameStep = (s: Step) => (s.policyName === oldName ? { ...s, policyName: name } : s);
      set({
        currentSharedFlow: {
          ...current,
          policies: current.policies.map((p) =>
            p.id === policyId
              ? {
                  ...p,
                  name,
                  xml: retargetPolicyXmlName(p.xml, oldName, name),
                }
              : p
          ),
          steps: current.steps.map(renameStep),
        },
        dirty: true,
      });
    },

    duplicatePolicy(policyId) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const source = current.policies.find((p) => p.id === policyId);
      if (!source) return;

      let newName = `${source.name}-copy`;
      let suffix = 2;
      while (current.policies.some((p) => p.name === newName)) {
        newName = `${source.name}-copy-${suffix++}`;
      }

      const duplicate: Policy = {
        id: nanoid(),
        name: newName,
        type: source.type,
        xml: retargetPolicyXmlName(source.xml, source.name, newName),
      };

      set({
        currentSharedFlow: { ...current, policies: [...current.policies, duplicate] },
        dirty: true,
        selectedPolicyId: duplicate.id,
      });
      notify(`Duplicated as "${newName}"`, 'success');
    },

    removePolicy(policyId) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const policy = current.policies.find((p) => p.id === policyId);
      if (!policy) return;
      set({
        currentSharedFlow: {
          ...current,
          policies: current.policies.filter((p) => p.id !== policyId),
          steps: current.steps.filter((s) => s.policyName !== policy.name),
        },
        dirty: true,
        selectedPolicyId: get().selectedPolicyId === policyId ? null : get().selectedPolicyId,
      });
    },

    addStep(policyName) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({ currentSharedFlow: { ...current, steps: [...current.steps, { policyName }] }, dirty: true });
    },

    updateStep(index, patch) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({
        currentSharedFlow: { ...current, steps: current.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) },
        dirty: true,
      });
    },

    removeStep(index) {
      const current = get().currentSharedFlow;
      if (!current) return;
      set({ currentSharedFlow: { ...current, steps: current.steps.filter((_, i) => i !== index) }, dirty: true });
    },

    moveStep(index, direction) {
      const current = get().currentSharedFlow;
      if (!current) return;
      const steps = [...current.steps];
      const newIdx = index + direction;
      if (newIdx < 0 || newIdx >= steps.length) return;
      [steps[index], steps[newIdx]] = [steps[newIdx], steps[index]];
      set({ currentSharedFlow: { ...current, steps }, dirty: true });
    },
  };
});
