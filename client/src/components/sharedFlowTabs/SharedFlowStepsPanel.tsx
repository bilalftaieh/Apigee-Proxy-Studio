import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { StepListFlat } from '../StepListFlat';
import { Icon } from '../Icon';

export function SharedFlowStepsPanel() {
  const sharedFlow = useSharedFlowStore((s) => s.currentSharedFlow)!;
  const addStep = useSharedFlowStore((s) => s.addStep);
  const updateStep = useSharedFlowStore((s) => s.updateStep);
  const removeStep = useSharedFlowStore((s) => s.removeStep);
  const moveStep = useSharedFlowStore((s) => s.moveStep);
  const setSelectedPolicyId = useSharedFlowStore((s) => s.setSelectedPolicyId);
  const setActiveTab = useSharedFlowStore((s) => s.setActiveTab);

  const jumpToPolicy = (policyName: string) => {
    const policy = sharedFlow.policies.find((p) => p.name === policyName);
    if (!policy) return;
    setSelectedPolicyId(policy.id);
    setActiveTab('policies');
  };

  return (
    <div>
      <div className="card">
        <h4 className="card-title">
          <Icon name="list-ordered" size={15} /> Steps
        </h4>
        <p className="card-subtitle">
          Runs top-to-bottom whenever a proxy (or another shared flow) calls this one via FlowCallout. There's no
          Request/Response split here — it runs in whichever context the caller placed it in.
        </p>
        <StepListFlat
          steps={sharedFlow.steps}
          availablePolicies={sharedFlow.policies.map((p) => p.name)}
          onAdd={addStep}
          onUpdate={updateStep}
          onRemove={removeStep}
          onMove={moveStep}
          onJumpToPolicy={jumpToPolicy}
        />
      </div>
    </div>
  );
}
