import { useStore } from '../../store/useStore';
import { ResourcesPanel } from '../ResourcesPanel';

// Binds the shared ResourcesPanel to the proxy store. The shared-flow editor
// binds the same panel to its own store — the two bundle formats hold resources
// identically, so the UI is worth sharing rather than copying.
export function ResourcesTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const selectedResourceId = useStore((s) => s.selectedResourceId);
  const setSelectedResourceId = useStore((s) => s.setSelectedResourceId);
  const addResource = useStore((s) => s.addResource);
  const updateResource = useStore((s) => s.updateResource);
  const renameResource = useStore((s) => s.renameResource);
  const deleteResource = useStore((s) => s.deleteResource);
  const linkResourceToPolicy = useStore((s) => s.linkResourceToPolicy);
  const unlinkResourceFromPolicy = useStore((s) => s.unlinkResourceFromPolicy);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setSelectedPolicyId = useStore((s) => s.setSelectedPolicyId);

  return (
    <ResourcesPanel
      resources={proxy.resources}
      policies={proxy.policies}
      selectedId={selectedResourceId}
      onSelect={setSelectedResourceId}
      onAdd={addResource}
      onUpdate={updateResource}
      onRename={renameResource}
      onDelete={deleteResource}
      onLink={linkResourceToPolicy}
      onUnlink={unlinkResourceFromPolicy}
      onOpenPolicy={(policyId) => {
        setSelectedPolicyId(policyId);
        setActiveTab('policies');
      }}
    />
  );
}
