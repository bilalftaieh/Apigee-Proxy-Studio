import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';

interface ExportOption {
  key: string;
  label: string;
  hint: string;
  icon: string;
  run: () => void | Promise<void>;
}

export function ExportMenu() {
  const linting = useStore((s) => s.linting);
  const exportProxy = useStore((s) => s.exportProxy);
  const exportDeploySet = useStore((s) => s.exportDeploySet);
  const exportPostman = useStore((s) => s.exportPostman);
  const exportOpenApi = useStore((s) => s.exportOpenApi);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups: { title: string; options: ExportOption[] }[] = [
    {
      title: 'Deploy',
      options: [
        { key: 'zip', label: 'Apigee Bundle', hint: '.zip — ready to deploy', icon: 'package', run: exportProxy },
        {
          key: 'deploy-set',
          label: 'Deploy Set',
          hint: '.zip — proxy + every shared flow it calls',
          icon: 'package-plus',
          run: exportDeploySet,
        },
      ],
    },
    {
      title: 'Test & document',
      options: [
        { key: 'postman', label: 'Postman Collection', hint: '.json — requests, auth & folders', icon: 'send', run: exportPostman },
        { key: 'openapi-json', label: 'OpenAPI Spec', hint: '.json (OAS 3.0)', icon: 'file-json-2', run: () => exportOpenApi('json') },
        { key: 'openapi-yaml', label: 'OpenAPI Spec', hint: '.yaml (OAS 3.0)', icon: 'file-code-2', run: () => exportOpenApi('yaml') },
      ],
    },
  ];

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        className="btn"
        onClick={() => setOpen((v) => !v)}
        disabled={linting}
        title="Export this proxy as a deployable bundle, or as a Postman/OpenAPI file for testing"
      >
        {linting ? <span className="spinner" /> : <Icon name="download" size={14} />}
        {linting ? 'Linting…' : 'Export'}
        <Icon name="chevron-down" size={13} className="export-menu-caret" />
      </button>

      {open && (
        <div className="export-menu-panel" role="menu">
          {groups.map((group) => (
            <div className="export-menu-group" key={group.title}>
              <div className="export-menu-group-title">{group.title}</div>
              {group.options.map((opt) => (
                <button
                  key={opt.key}
                  className="export-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    opt.run();
                  }}
                >
                  <span className="export-menu-item-icon">
                    <Icon name={opt.icon} size={15} />
                  </span>
                  <span className="export-menu-item-body">
                    <span className="export-menu-item-label">{opt.label}</span>
                    <span className="export-menu-item-hint">{opt.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
