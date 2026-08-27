import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { ResourcesPanel } from '../ResourcesPanel';

// Same panel the proxy editor uses, bound to the shared-flow store — a
// sharedflowbundle holds resources/ exactly like an apiproxy does.
export function SharedFlowResourcesPanel() {
  const sharedFlow = useSharedFlowStore((s) => s.currentSharedFlow)!;
  const selectedResourceId = useSharedFlowStore((s) => s.selectedResourceId);
  const setSelectedResourceId = useSharedFlowStore((s) => s.setSelectedResourceId);
  const addResource = useSharedFlowStore((s) => s.addResource);
  const updateResource = useSharedFlowStore((s) => s.updateResource);
  const renameResource = useSharedFlowStore((s) => s.renameResource);
  const deleteResource = useSharedFlowStore((s) => s.deleteResource);
  const linkResourceToPolicy = useSharedFlowStore((s) => s.linkResourceToPolicy);
  const unlinkResourceFromPolicy = useSharedFlowStore((s) => s.unlinkResourceFromPolicy);
  const setActiveTab = useSharedFlowStore((s) => s.setActiveTab);
  const setSelectedPolicyId = useSharedFlowStore((s) => s.setSelectedPolicyId);

  return (
    <ResourcesPanel
      resources={sharedFlow.resources}
      policies={sharedFlow.policies}
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
