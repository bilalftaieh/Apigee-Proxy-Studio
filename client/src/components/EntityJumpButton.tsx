import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import type { EntityJump } from '../lib/entityLinks';

// A small "View" affordance for anywhere a lint message or prerequisite
// mentions a policy/target/resource this proxy actually has — jumps straight
// to it instead of leaving you to go find it by hand.
export function EntityJumpButton({ jump }: { jump: EntityJump }) {
  const setSelectedPolicyId = useStore((s) => s.setSelectedPolicyId);
  const setSelectedTargetId = useStore((s) => s.setSelectedTargetId);
  const setSelectedResourceId = useStore((s) => s.setSelectedResourceId);
  const setActiveTab = useStore((s) => s.setActiveTab);

  const go = () => {
    if (jump.kind === 'policy') {
      setSelectedPolicyId(jump.id);
      setActiveTab('policies');
    } else if (jump.kind === 'target') {
      setSelectedTargetId(jump.id);
      setActiveTab('targetEndpoint');
    } else {
      setSelectedResourceId(jump.id);
      setActiveTab('resources');
    }
  };

  return (
    <button className="btn btn-sm btn-ghost" style={{ flexShrink: 0 }} onClick={go} title={`View ${jump.label}`}>
      <Icon name="external-link" size={12} /> View
    </button>
  );
}
