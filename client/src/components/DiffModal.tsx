import { useEffect, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { api } from '../api/client';
import { setupApigeeMonaco } from '../lib/monacoApigee';
import type { BundleDiffResult, DiffSide } from '../types/proxy';

function languageFor(path: string): string {
  if (path.endsWith('.xml')) return 'xml';
  if (path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.properties')) return 'ini';
  return 'plaintext';
}

type FileRow = { path: string; status: 'added' | 'removed' | 'changed' | 'unchanged' };

function groupFiles(rows: FileRow[]) {
  const groups = new Map<string, FileRow[]>();
  for (const row of rows) {
    const parts = row.path.split('/');
    const dir = parts.slice(0, -1).join('/');
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const STATUS_META: Record<FileRow['status'], { icon: string; color: string; label: string }> = {
  added: { icon: 'plus-circle', color: 'var(--success)', label: 'added' },
  removed: { icon: 'minus-circle', color: 'var(--error)', label: 'removed' },
  changed: { icon: 'pencil', color: 'var(--warning)', label: 'changed' },
  unchanged: { icon: 'file-code', color: 'var(--text-3)', label: '' },
};

export function DiffModal({
  onClose,
  leftLabel,
  rightLabel,
  left,
  right,
  environmentId,
}: {
  onClose: () => void;
  leftLabel: string;
  rightLabel: string;
  left: DiffSide;
  right: DiffSide;
  environmentId?: string | null;
}) {
  const [result, setResult] = useState<BundleDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .diffBundles(left, right, environmentId)
      .then((r) => {
        setResult(r);
        setError(null);
        const firstInteresting = [...r.changed.map((c) => c.path), ...r.added, ...r.removed][0];
        setSelected(firstInteresting || Object.keys(r.leftFiles)[0] || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: FileRow[] = useMemo(() => {
    if (!result) return [];
    const changedPaths = new Set(result.changed.map((c) => c.path));
    return [
      ...result.added.map((path) => ({ path, status: 'added' as const })),
      ...result.removed.map((path) => ({ path, status: 'removed' as const })),
      ...result.changed.map((c) => ({ path: c.path, status: 'changed' as const })),
      ...(showUnchanged ? result.unchanged.filter((p) => !changedPaths.has(p)).map((path) => ({ path, status: 'unchanged' as const })) : []),
    ];
  }, [result, showUnchanged]);

  const groups = useMemo(() => groupFiles(rows), [rows]);

  const summary = result
    ? `${result.changed.length} file${result.changed.length === 1 ? '' : 's'} differ, ${result.added.length} only in ${rightLabel}, ${result.removed.length} only in ${leftLabel}`
    : '';

  return (
    <Modal title={`Diff: ${leftLabel} vs ${rightLabel}`} onClose={onClose} xl>
      <div className="modal-body preview-layout">
        <div className="preview-file-col">
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
              <span className="spinner" /> Comparing…
            </div>
          )}
          {error && <div style={{ color: 'var(--error)', fontSize: 12.5 }}>{error}</div>}
          {result && (
            <>
              <div className="field-hint" style={{ marginBottom: 10 }}>
                {summary}
              </div>
              {result.unchanged.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
                  <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} />
                  Show {result.unchanged.length} unchanged file{result.unchanged.length === 1 ? '' : 's'}
                </label>
              )}
              {rows.length === 0 && !showUnchanged && (
                <div className="field-hint">No differences{result.unchanged.length ? ' (all files unchanged)' : ''}.</div>
              )}
              <div className="file-tree">
                {groups.map(([dir, items]) => (
                  <div key={dir || 'root'}>
                    <div className="file-tree-group">{dir || '(root)'}</div>
                    {items.map((row) => {
                      const meta = STATUS_META[row.status];
                      return (
                        <div
                          key={row.path}
                          className={`file-tree-item ${selected === row.path ? 'active' : ''}`}
                          onClick={() => setSelected(row.path)}
                        >
                          <Icon name={meta.icon} size={13} color={meta.color} />
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.path.split('/').pop()}
                          </span>
                          {meta.label && (
                            <span className="field-hint" style={{ color: meta.color, flexShrink: 0 }}>
                              {meta.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="policy-editor">
          <div className="policy-editor-head">
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              {selected || (loading ? '' : 'No file selected')}
            </span>
            <span className="template-badge">
              {leftLabel} &rarr; {rightLabel}
            </span>
          </div>
          <div className="monaco-wrap">
            {selected && result && (
              <DiffEditor
                key={selected}
                language={languageFor(selected)}
                theme="apigee-dark"
                beforeMount={setupApigeeMonaco}
                original={result.leftFiles[selected] ?? ''}
                modified={result.rightFiles[selected] ?? ''}
                options={{
                  readOnly: true,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  renderSideBySide: true,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
