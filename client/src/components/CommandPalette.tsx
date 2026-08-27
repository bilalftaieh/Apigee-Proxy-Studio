import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type TabKey } from '../store/useStore';
import { useSharedFlowStore, type SharedFlowTabKey } from '../store/useSharedFlowStore';
import { useUiStore } from '../store/useUiStore';
import { fuzzyMatch, highlightRuns } from '../lib/fuzzy';
import { Icon } from './Icon';

interface Command {
  id: string;
  group: string;
  label: string;
  /** Secondary line — the base path, the policy type, what the action does. */
  hint?: string;
  icon: string;
  /** Extra text the query is matched against but that isn't displayed. */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

/** Order groups appear in. Anything unlisted sorts last, alphabetically. */
const GROUP_ORDER = ['Actions', 'Go to', 'Policies', 'Flows', 'Targets', 'Resources', 'Proxies', 'Shared Flows', 'Templates'];

const PROXY_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { key: 'proxyEndpoint', label: 'Proxy Endpoint', icon: 'signpost' },
  { key: 'targetEndpoint', label: 'Target Endpoint', icon: 'server' },
  { key: 'flowDiagram', label: 'Flow Diagram', icon: 'workflow' },
  { key: 'policies', label: 'Policies', icon: 'shield' },
  { key: 'resources', label: 'Resources', icon: 'folder-code' },
  { key: 'tests', label: 'Test', icon: 'flask-conical' },
  { key: 'lint', label: 'Lint', icon: 'scan-line' },
  { key: 'preview', label: 'XML Preview', icon: 'file-code' },
];

const SHARED_FLOW_TABS: { key: SharedFlowTabKey; label: string; icon: string }[] = [
  { key: 'steps', label: 'Steps', icon: 'list-ordered' },
  { key: 'policies', label: 'Policies', icon: 'shield' },
  { key: 'resources', label: 'Resources', icon: 'folder-code' },
  { key: 'lint', label: 'Lint', icon: 'scan-line' },
  { key: 'preview', label: 'XML Preview', icon: 'file-code' },
];

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const close = useUiStore((s) => s.closeCommandPalette);

  const proxies = useStore((s) => s.proxies);
  const templates = useStore((s) => s.templates);
  const currentProxy = useStore((s) => s.currentProxy);
  const dirty = useStore((s) => s.dirty);
  const sharedFlows = useSharedFlowStore((s) => s.sharedFlows);
  const currentSharedFlow = useSharedFlowStore((s) => s.currentSharedFlow);
  const sharedFlowDirty = useSharedFlowStore((s) => s.dirty);
  // Whichever document is open, its undo depths drive the two history commands'
  // hints and whether they do anything.
  const undoDepth = useStore((s) => s.undoDepth);
  const redoDepth = useStore((s) => s.redoDepth);
  const sharedFlowUndoDepth = useSharedFlowStore((s) => s.undoDepth);
  const sharedFlowRedoDepth = useSharedFlowStore((s) => s.redoDepth);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    // Read actions off the stores lazily: they're stable, and pulling every one
    // through a selector would re-run this memo on unrelated state changes.
    const proxyStore = useStore.getState;
    const sfStore = useSharedFlowStore.getState;
    const list: Command[] = [];

    const openProxyById = (id: string) => {
      sfStore().closeSharedFlow();
      proxyStore().openProxy(id);
    };

    if (currentSharedFlow) {
      list.push({
        id: 'act-save-sf',
        group: 'Actions',
        label: 'Save shared flow',
        hint: sharedFlowDirty ? 'Unsaved changes' : 'Nothing to save',
        icon: 'save',
        shortcut: 'Ctrl+S',
        run: () => sharedFlowDirty && sfStore().saveSharedFlow(),
      });
      list.push({
        id: 'act-export-sf',
        group: 'Actions',
        label: 'Export shared flow ZIP',
        hint: 'Runs apigeelint first',
        icon: 'download',
        run: () => sfStore().exportSharedFlow(),
      });
      list.push({
        id: 'act-lint-sf',
        group: 'Actions',
        label: 'Run lint',
        icon: 'scan-line',
        run: () => {
          sfStore().setActiveTab('lint');
          sfStore().runLint();
        },
      });
      list.push({
        id: 'act-undo-sf',
        group: 'Actions',
        label: 'Undo',
        hint: sharedFlowUndoDepth ? `${sharedFlowUndoDepth} step${sharedFlowUndoDepth === 1 ? '' : 's'} available` : 'Nothing to undo',
        icon: 'undo-2',
        shortcut: 'Ctrl+Z',
        run: () => sfStore().undo(),
      });
      list.push({
        id: 'act-redo-sf',
        group: 'Actions',
        label: 'Redo',
        hint: sharedFlowRedoDepth ? `${sharedFlowRedoDepth} step${sharedFlowRedoDepth === 1 ? '' : 's'} available` : 'Nothing to redo',
        icon: 'redo-2',
        shortcut: 'Ctrl+Shift+Z',
        run: () => sfStore().redo(),
      });
      SHARED_FLOW_TABS.forEach((t) =>
        list.push({
          id: `tab-sf-${t.key}`,
          group: 'Go to',
          label: t.label,
          hint: currentSharedFlow.name,
          icon: t.icon,
          run: () => sfStore().setActiveTab(t.key),
        })
      );
      currentSharedFlow.policies.forEach((p) =>
        list.push({
          id: `pol-sf-${p.id}`,
          group: 'Policies',
          label: p.name,
          hint: p.type,
          icon: 'shield',
          keywords: p.type,
          run: () => {
            sfStore().setSelectedPolicyId(p.id);
            sfStore().setActiveTab('policies');
          },
        })
      );
    } else if (currentProxy) {
      list.push({
        id: 'act-save',
        group: 'Actions',
        label: 'Save proxy',
        hint: dirty ? 'Unsaved changes' : 'Nothing to save',
        icon: 'save',
        shortcut: 'Ctrl+S',
        run: () => dirty && proxyStore().saveProxy(),
      });
      list.push({
        id: 'act-export',
        group: 'Actions',
        label: 'Export bundle ZIP',
        hint: 'Runs apigeelint first',
        icon: 'download',
        run: () => proxyStore().exportProxy(),
      });
      list.push({
        id: 'act-undo',
        group: 'Actions',
        label: 'Undo',
        hint: undoDepth ? `${undoDepth} step${undoDepth === 1 ? '' : 's'} available` : 'Nothing to undo',
        icon: 'undo-2',
        shortcut: 'Ctrl+Z',
        run: () => proxyStore().undo(),
      });
      list.push({
        id: 'act-redo',
        group: 'Actions',
        label: 'Redo',
        hint: redoDepth ? `${redoDepth} step${redoDepth === 1 ? '' : 's'} available` : 'Nothing to redo',
        icon: 'redo-2',
        shortcut: 'Ctrl+Shift+Z',
        run: () => proxyStore().redo(),
      });
      list.push({
        id: 'act-export-postman',
        group: 'Actions',
        label: 'Export Postman collection',
        icon: 'file-json',
        run: () => proxyStore().exportPostman(),
      });
      list.push({
        id: 'act-export-openapi',
        group: 'Actions',
        label: 'Export OpenAPI spec (YAML)',
        icon: 'file-text',
        run: () => proxyStore().exportOpenApi('yaml'),
      });
      list.push({
        id: 'act-lint',
        group: 'Actions',
        label: 'Run lint',
        icon: 'scan-line',
        run: () => {
          proxyStore().setActiveTab('lint');
          proxyStore().runLint();
        },
      });
      PROXY_TABS.forEach((t) =>
        list.push({
          id: `tab-${t.key}`,
          group: 'Go to',
          label: t.label,
          hint: currentProxy.name,
          icon: t.icon,
          run: () => proxyStore().setActiveTab(t.key),
        })
      );
      currentProxy.policies.forEach((p) =>
        list.push({
          id: `pol-${p.id}`,
          group: 'Policies',
          label: p.name,
          hint: p.type,
          icon: 'shield',
          keywords: p.type,
          run: () => {
            proxyStore().setSelectedPolicyId(p.id);
            proxyStore().setActiveTab('policies');
          },
        })
      );
      currentProxy.flows.forEach((f) =>
        list.push({
          id: `flow-${f.id}`,
          group: 'Flows',
          label: f.name,
          hint: f.condition || 'always matches',
          icon: 'git-fork',
          keywords: `${f.verb ?? ''} ${f.pathValue ?? ''}`,
          run: () => proxyStore().setActiveTab('proxyEndpoint'),
        })
      );
      currentProxy.targets.forEach((t) =>
        list.push({
          id: `tgt-${t.id}`,
          group: 'Targets',
          label: t.name,
          hint: t.mode === 'targetServer' ? t.targetServers.join(', ') : t.url?.value,
          icon: 'server',
          run: () => {
            proxyStore().setSelectedTargetId(t.id);
            proxyStore().setActiveTab('targetEndpoint');
          },
        })
      );
      currentProxy.resources.forEach((r) =>
        list.push({
          id: `res-${r.id}`,
          group: 'Resources',
          label: r.path,
          icon: 'folder-code',
          run: () => {
            proxyStore().setSelectedResourceId(r.id);
            proxyStore().setActiveTab('resources');
          },
        })
      );
    }

    list.push({
      id: 'act-new-proxy',
      group: 'Actions',
      label: 'New proxy',
      icon: 'plus',
      run: () => document.querySelector<HTMLButtonElement>('[aria-label="New proxy"]')?.click(),
    });
    list.push({
      id: 'act-import-proxy',
      group: 'Actions',
      label: 'Import a proxy',
      hint: 'From a .zip, an OpenAPI spec, or a curl command',
      icon: 'upload',
      run: () => document.querySelector<HTMLButtonElement>('[aria-label="Import a proxy"]')?.click(),
    });
    list.push({
      id: 'act-new-sf',
      group: 'Actions',
      label: 'New shared flow',
      icon: 'git-branch',
      run: () => document.querySelector<HTMLButtonElement>('[aria-label="New shared flow"]')?.click(),
    });

    proxies.forEach((p) =>
      list.push({
        id: `proxy-${p.id}`,
        group: 'Proxies',
        label: p.name,
        hint: `${p.basePath} · ${p.policyCount} polic${p.policyCount === 1 ? 'y' : 'ies'}`,
        icon: 'waypoints',
        keywords: p.basePath,
        run: () => openProxyById(p.id),
      })
    );
    sharedFlows.forEach((sf) =>
      list.push({
        id: `sf-${sf.id}`,
        group: 'Shared Flows',
        label: sf.name,
        hint: `${sf.stepCount} step${sf.stepCount === 1 ? '' : 's'} · ${sf.policyCount} polic${sf.policyCount === 1 ? 'y' : 'ies'}`,
        icon: 'git-branch',
        run: () => {
          proxyStore().closeProxy();
          sfStore().openSharedFlow(sf.id);
        },
      })
    );
    templates.forEach((t) =>
      list.push({
        id: `tpl-${t.id}`,
        group: 'Templates',
        label: t.name,
        hint: t.description,
        icon: 'layout-template',
        run: () => {
          // The template flow needs a name/base-path dialog, which lives in the
          // sidebar — clicking its row is the only way in without duplicating it.
          const row = Array.from(document.querySelectorAll<HTMLElement>('.nav-item')).find(
            (el) => el.querySelector('.nav-item-title')?.textContent === t.name
          );
          row?.click();
        },
      })
    );

    return list;
  }, [proxies, templates, sharedFlows, currentProxy, currentSharedFlow, dirty, sharedFlowDirty, undoDepth, redoDepth, sharedFlowUndoDepth, sharedFlowRedoDepth]);

  const results = useMemo(() => {
    const q = query.trim();
    const scored = commands
      .map((c) => {
        const onLabel = fuzzyMatch(q, c.label);
        if (onLabel) return { command: c, score: onLabel.score, indices: onLabel.indices };
        // Fall back to the hidden text, but never highlight it — a hit there
        // with no visible match looks like a bug.
        const haystack = `${c.hint ?? ''} ${c.keywords ?? ''}`.trim();
        const onOther = haystack ? fuzzyMatch(q, haystack) : null;
        return onOther ? { command: c, score: onOther.score - 30, indices: [] } : null;
      })
      .filter((r): r is { command: Command; score: number; indices: number[] } => r !== null);

    if (q) scored.sort((a, b) => b.score - a.score);

    const groups = new Map<string, typeof scored>();
    scored.forEach((r) => {
      const bucket = groups.get(r.command.group);
      if (bucket) bucket.push(r);
      else groups.set(r.command.group, [r]);
    });

    const ordered = Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    // An unfiltered palette listing every policy in a 27-policy proxy is a wall
    // of text — cap each group until the user actually types something.
    const cap = q ? 8 : 5;
    return ordered.map(([group, items]) => ({ group, items: items.slice(0, cap), hidden: Math.max(0, items.length - cap) }));
  }, [commands, query]);

  const flat = useMemo(() => results.flatMap((g) => g.items), [results]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results]);

  // The dialog's own handler covers the normal case, but focus can end up
  // outside it (clicking the backdrop, tabbing away) and Escape has to keep
  // working from there. Matches how Modal handles it.
  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open, close]);

  if (!open) return null;

  const runAt = (index: number) => {
    const target = flat[index];
    if (!target) return;
    close();
    target.command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(Math.max(0, flat.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(cursor);
    }
  };

  let index = -1;
  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="cmdk-input-row">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            // The palette unmounts when closed, so this re-fires on every open.
            autoFocus
            className="cmdk-input"
            placeholder="Search proxies, policies, tabs and actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={flat[cursor] ? `cmdk-opt-${flat[cursor].command.id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk-kbd">Esc</kbd>
        </div>

        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {flat.length === 0 && <div className="cmdk-empty">No matches for “{query}”</div>}
          {results.map((group) => (
            <div className="cmdk-group" key={group.group}>
              <div className="cmdk-group-title">{group.group}</div>
              {group.items.map((r) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={r.command.id}
                    id={`cmdk-opt-${r.command.id}`}
                    role="option"
                    aria-selected={i === cursor}
                    className={`cmdk-item ${i === cursor ? 'active' : ''}`}
                    onMouseMove={() => i !== cursor && setCursor(i)}
                    onClick={() => runAt(i)}
                  >
                    <div className="cmdk-item-icon">
                      <Icon name={r.command.icon} size={14} />
                    </div>
                    <div className="cmdk-item-body">
                      <div className="cmdk-item-label">
                        {highlightRuns(r.command.label, r.indices).map((run, k) =>
                          run.hit ? <mark key={k}>{run.text}</mark> : <span key={k}>{run.text}</span>
                        )}
                      </div>
                      {r.command.hint && <div className="cmdk-item-hint">{r.command.hint}</div>}
                    </div>
                    {r.command.shortcut && <kbd className="cmdk-kbd">{r.command.shortcut}</kbd>}
                  </div>
                );
              })}
              {group.hidden > 0 && <div className="cmdk-more">+{group.hidden} more — keep typing to narrow</div>}
            </div>
          ))}
        </div>

        <div className="cmdk-footer">
          <span>
            <kbd className="cmdk-kbd">↑</kbd>
            <kbd className="cmdk-kbd">↓</kbd> navigate
          </span>
          <span>
            <kbd className="cmdk-kbd">↵</kbd> run
          </span>
          <span>
            <kbd className="cmdk-kbd">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
