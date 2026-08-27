import { useStore } from '../store/useStore';
import { Icon } from './Icon';

export function SuggestionBanner() {
  const suggestion = useStore((s) => s.suggestion);
  const policyTypes = useStore((s) => s.policyTypes);
  const acceptSuggestion = useStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useStore((s) => s.dismissSuggestion);

  if (!suggestion.length) return null;

  return (
    <div className="suggestion-banner">
      <div className="suggestion-banner-head">
        <Icon name="lightbulb" size={14} color="var(--accent-blue)" />
        <span>Pairs well with what you just added</span>
        <button className="icon-btn" onClick={dismissSuggestion} aria-label="Dismiss suggestions" title="Dismiss">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="suggestion-banner-items">
        {suggestion.map((s) => {
          const type = policyTypes.find((t) => t.key === s.type);
          return (
            <div className="suggestion-item" key={s.type}>
              <div className="policy-card-icon" style={{ background: `${type?.accent || '#8b93a7'}22`, color: type?.accent || '#8b93a7' }}>
                <Icon name={type?.icon || 'puzzle'} size={14} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="suggestion-item-label">{type?.label || s.type}</div>
                <div className="suggestion-item-reason">{s.reason}</div>
              </div>
              <button className="btn btn-sm" onClick={() => acceptSuggestion(s.type)}>
                <Icon name="plus" size={12} /> Add
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
