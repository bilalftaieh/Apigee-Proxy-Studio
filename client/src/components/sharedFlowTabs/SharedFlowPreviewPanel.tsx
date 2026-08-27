import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { api } from '../../api/client';
import { Icon } from '../Icon';
import { setupApigeeMonaco } from '../../lib/monacoApigee';

function groupFiles(paths: string[]) {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const parts = path.split('/');
    const dir = parts.slice(0, -1).join('/');
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(path);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function SharedFlowPreviewPanel() {
  const sharedFlow = useSharedFlowStore((s) => s.currentSharedFlow)!;
  const exportSharedFlow = useSharedFlowStore((s) => s.exportSharedFlow);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .previewSharedFlowBundle(sharedFlow)
        .then(({ files }) => {
          setFiles(files);
          setError(null);
          setSelected((prev) => (prev && files[prev] ? prev : Object.keys(files)[0] || null));
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sharedFlow)]);

  const groups = useMemo(() => groupFiles(Object.keys(files)), [files]);

  return (
    <div className="preview-layout">
      <div>
        <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 12 }} onClick={exportSharedFlow}>
          <Icon name="download" size={13} /> Export ZIP Bundle
        </button>
        <div className="file-tree">
          {groups.map(([dir, items]) => (
            <div key={dir || 'root'}>
              <div className="file-tree-group">{dir || 'sharedflowbundle'}</div>
              {items.map((path) => (
                <div
                  key={path}
                  className={`file-tree-item ${selected === path ? 'active' : ''}`}
                  onClick={() => setSelected(path)}
                >
                  <Icon name="file-code" size={13} />
                  {path.split('/').pop()}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="policy-editor">
        <div className="policy-editor-head">
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            {selected || (loading ? 'Generating…' : 'No files')}
          </span>
          <span className="template-badge">read-only</span>
        </div>
        {error ? (
          <div style={{ padding: 20, color: 'var(--error)', fontSize: 13 }}>{error}</div>
        ) : (
          <div className="monaco-wrap">
            <Editor
              key={selected}
              defaultLanguage="xml"
              theme="apigee-dark"
              beforeMount={setupApigeeMonaco}
              value={selected ? files[selected] : ''}
              options={{
                readOnly: true,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 14 },
                renderLineHighlight: 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
