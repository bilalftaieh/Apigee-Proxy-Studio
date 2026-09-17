import { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { useSharedFlowStore } from './store/useSharedFlowStore';
import { AppBar } from './components/AppBar';
import { Sidebar } from './components/Sidebar';
import { EmptyState } from './components/EmptyState';
import { Toasts } from './components/Toasts';
import { SuggestionBanner } from './components/SuggestionBanner';
import { ProxyEditor } from './components/ProxyEditor';
import { SharedFlowEditor } from './components/SharedFlowEditor';
import { WorkspaceView } from './components/WorkspaceView';
import { CommandPalette } from './components/CommandPalette';
import { LogConsole } from './components/LogConsole';
import { useUiStore } from './store/useUiStore';
import { useWorkspaceStore } from './store/useWorkspaceStore';

/**
 * Below this the two-pane shell stops working: a 288px sidebar leaves the
 * editor too little to lay out its own two columns, and the header's actions
 * wrap into a third row. The rail collapses on its own here rather than
 * waiting for the user to notice and do it.
 */
const NARROW_SHELL = '(max-width: 960px)';

function useNarrowShell(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_SHELL).matches);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_SHELL);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    // The width can have changed between the initial render and this effect.
    setNarrow(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

/**
 * True when the caret is somewhere with its own undo history, which should keep
 * Ctrl+Z rather than have it mean "undo the last document edit".
 */
function isEditingText(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  // Monaco's focused surface is a textarea in most builds, but not in every
  // mode (read-only and diff views park focus on a div), so match the wrapper
  // too rather than relying on the tag alone.
  return Boolean(el.closest('.monaco-editor'));
}

export default function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const currentProxy = useStore((s) => s.currentProxy);
  const refreshSharedFlows = useSharedFlowStore((s) => s.refreshSharedFlows);
  const currentSharedFlow = useSharedFlowStore((s) => s.currentSharedFlow);
  const workspaceOpen = useWorkspaceStore((s) => s.open);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const narrowShell = useNarrowShell();
  // Either reason collapses the rail, but only the preference is the user's —
  // the width one is undone by widening the window, not by the toggle.
  const railCollapsed = sidebarCollapsed || narrowShell;

  useEffect(() => {
    bootstrap();
    refreshSharedFlows();
  }, [bootstrap, refreshSharedFlows]);

  // Backstop for async failures no call site caught. Every one of those used to
  // land in the console and nowhere else, so the UI's answer to a failed
  // request was to do nothing at all — indistinguishable from a dead click.
  // Store actions that already report their own errors never reach here,
  // because a caught rejection isn't an unhandled one.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? 'Unknown error');
      useStore.getState().pushToast(`Something went wrong — ${message}`, 'error');
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  // Global shortcuts. Ctrl/Cmd+K opens the command palette; Ctrl/Cmd+S saves
  // whatever is open — without the latter the browser's save-page dialog fires
  // instead, which is the last thing anyone wants mid-edit. Ctrl/Cmd+Z and
  // Ctrl/Cmd+Shift+Z (or Ctrl+Y) undo/redo document edits.
  // State is read via getState() so the listener binds once and never goes
  // stale — Monaco lets both keydowns bubble, so they work from inside the
  // policy editor too.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        useUiStore.getState().toggleCommandPalette();
        return;
      }

      // Ctrl/Cmd+B collapses the sidebar, the shortcut every editor with a
      // sidebar uses. No-op while the window is narrow enough to force it.
      if ((e.key === 'b' || e.key === 'B') && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (!window.matchMedia(NARROW_SHELL).matches) useUiStore.getState().toggleSidebar();
        return;
      }

      // Ctrl/Cmd+` opens the log panel — the convention devtools consoles use,
      // and a key that no text input claims.
      if (e.key === '`' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        useUiStore.getState().toggleLogConsole();
        return;
      }

      const undoKey = (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.altKey;
      const redoKey = (e.key === 'y' || e.key === 'Y') && e.ctrlKey && !e.altKey && !e.shiftKey;
      if (undoKey || redoKey) {
        // Text inputs and Monaco keep their own undo stacks, and while the
        // caret is in one that is the stack the user means — stealing the
        // keystroke there would revert a whole policy instead of the character
        // just typed. Document-level undo applies everywhere else.
        if (isEditingText(document.activeElement)) return;
        e.preventDefault();
        const store = useSharedFlowStore.getState().currentSharedFlow ? useSharedFlowStore.getState() : useStore.getState();
        if (redoKey || e.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (e.key !== 's' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      const sharedFlow = useSharedFlowStore.getState();
      if (sharedFlow.currentSharedFlow) {
        if (sharedFlow.dirty && !sharedFlow.saving) sharedFlow.saveSharedFlow();
        return;
      }
      const proxy = useStore.getState();
      if (proxy.currentProxy && proxy.dirty && !proxy.saving) proxy.saveProxy();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-frame">
      <AppBar canToggleSidebar={!narrowShell} />
      <div className="shell" data-sidebar={railCollapsed ? 'collapsed' : undefined}>
        <Sidebar collapsed={railCollapsed} />
        <div className="main">
          {workspaceOpen ? (
            <WorkspaceView />
          ) : currentSharedFlow ? (
            <SharedFlowEditor />
          ) : currentProxy ? (
            <ProxyEditor />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
      <Toasts />
      <SuggestionBanner />
      <CommandPalette />
      <LogConsole />
    </div>
  );
}
