import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useSharedFlowStore } from '../store/useSharedFlowStore';
import { setSharedFlowBundleName } from '../lib/policyXml';
import { Icon } from './Icon';

function extractSharedFlowName(xml: string): string {
  return xml.match(/<SharedFlowBundle>([^<]*)<\/SharedFlowBundle>/)?.[1]?.trim() || '';
}

// Shown above a FlowCallout policy's XML editor — lets you pick from shared
// flows actually built in this workspace instead of typing the name by hand,
// and jump straight to whichever one it currently calls.
export function FlowCalloutHelper({ xml, onInsert }: { xml: string; onInsert: (xml: string) => void }) {
  const sharedFlows = useSharedFlowStore((s) => s.sharedFlows);
  const openSharedFlow = useSharedFlowStore((s) => s.openSharedFlow);
  const closeProxy = useStore((s) => s.closeProxy);
  const [pending, setPending] = useState('');

  const currentName = extractSharedFlowName(xml);
  const currentSharedFlow = sharedFlows.find((sf) => sf.name === currentName);

  if (sharedFlows.length === 0 && !currentName) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
        flexWrap: 'wrap',
      }}
    >
      <Icon name="git-branch" size={13} color="var(--text-2)" />
      {currentName && (
        <>
          <span className="field-hint" style={{ flexShrink: 0 }}>
            Calls
          </span>
          <span className="template-badge mono">{currentName}</span>
          {currentSharedFlow ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                closeProxy();
                openSharedFlow(currentSharedFlow.id);
              }}
            >
              <Icon name="external-link" size={12} /> Open
            </button>
          ) : (
            <span className="field-hint" style={{ color: 'var(--warning)' }}>
              not one of your saved shared flows
            </span>
          )}
        </>
      )}
      {sharedFlows.length > 0 && (
        <>
          <span className="field-hint" style={{ flexShrink: 0, marginLeft: currentName ? 'auto' : 0 }}>
            {currentName ? 'Change to' : 'Insert shared flow'}
          </span>
          <select value={pending} onChange={(e) => setPending(e.target.value)} style={{ flex: currentName ? '0 1 200px' : 1 }}>
            <option value="">Choose one you've built…</option>
            {sharedFlows.map((sf) => (
              <option key={sf.id} value={sf.name}>
                {sf.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            disabled={!pending}
            onClick={() => {
              onInsert(setSharedFlowBundleName(xml, pending));
              setPending('');
            }}
          >
            {currentName ? 'Change' : 'Insert'}
          </button>
        </>
      )}
    </div>
  );
}
