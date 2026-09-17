import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import { policyCategory } from '../lib/policyCategory';

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
              {/* Category rather than the per-type accent: those hexes are
                  dark-theme values, and an 0x22 alpha of one on white is a
                  wash you cannot see. */}
              <div className="policy-card-icon" data-cat={policyCategory(s.type, type?.category)}>
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
