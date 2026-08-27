import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import { NewProxyModal } from './NewProxyModal';
import { UseTemplateModal } from './UseTemplateModal';
import type { Template } from '../types/proxy';

export function EmptyState() {
  const templates = useStore((s) => s.templates);
  const [showNewProxy, setShowNewProxy] = useState(false);
  const [templateToUse, setTemplateToUse] = useState<Template | null>(null);

  return (
    <div className="empty-state">
      <div className="empty-orb">
        <Icon name="puzzle" size={38} color="#06120e" />
      </div>
      <h2>Design your next Apigee X proxy</h2>
      <p>
        Build proxy endpoints, conditional flows and policies visually, then export a ready-to-import
        <code className="mono"> apiproxy </code>
        zip bundle — no deployment, no gcloud, no surprises.
      </p>

      <div className="quickstart-grid">
        <button className="quickstart-card" onClick={() => setShowNewProxy(true)}>
          <div className="quickstart-card-icon">
            <Icon name="sparkles" size={18} />
          </div>
          <h3>Start from scratch</h3>
          <p>A blank proxy with a single target endpoint. Full control from step one.</p>
        </button>

        {templates.map((t) => (
          <button key={t.id} className="quickstart-card" onClick={() => setTemplateToUse(t)}>
            <div className="quickstart-card-icon">
              <Icon name="layout-template" size={18} />
            </div>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
          </button>
        ))}
      </div>

      {showNewProxy && <NewProxyModal onClose={() => setShowNewProxy(false)} />}
      {templateToUse && <UseTemplateModal template={templateToUse} onClose={() => setTemplateToUse(null)} />}
    </div>
  );
}
