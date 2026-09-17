import { Icon } from './Icon';
import { useUiStore } from '../store/useUiStore';

/**
 * The band across the top of every screen: the mark, the workspace, one global
 * search and the AI entry point.
 *
 * It exists because the studio's eight tabs and three editors used to read as
 * eight separate panels — there was nothing above them saying they were one
 * product. Everything here is app-level rather than proxy-level, which is also
 * why the brand block and the search box left the sidebar: they were duplicated
 * per-pane furniture, and the sidebar is now only a list of things to open.
 *
 * The search field is a button, not an input. It opens the command palette,
 * which is what actually searches — a second real input here would be a second
 * place to type the same query.
 */
export function AppBar({ canToggleSidebar }: { canToggleSidebar: boolean }) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const toggleLogConsole = useUiStore((s) => s.toggleLogConsole);

  return (
    <header className="appbar">
      {canToggleSidebar && (
        <button
          type="button"
          className="appbar-icon-btn"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
        >
          <Icon name="panel-left" size={17} />
        </button>
      )}

      <div className="appbar-mark" aria-hidden="true">
        <Icon name="waypoints" size={14} color="#ffffff" />
      </div>
      <span className="appbar-wordmark">Apigee Proxy Studio</span>
      <span className="appbar-divider" aria-hidden="true" />
      <span className="appbar-workspace">local workspace</span>

      <div className="appbar-search-slot">
        <button
          type="button"
          className="appbar-search"
          onClick={openCommandPalette}
          title="Search everything (Ctrl+K)"
        >
          <Icon name="search" size={14} />
          <span className="appbar-search-label">Search proxies, policies, flow variables</span>
          <span className="appbar-key mono">Ctrl K</span>
        </button>
      </div>

      <button
        type="button"
        className="appbar-icon-btn"
        onClick={toggleLogConsole}
        aria-label="Server log console"
        title="Server log console (Ctrl+`)"
      >
        <Icon name="terminal" size={16} />
      </button>
    </header>
  );
}
