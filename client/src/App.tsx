import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { useSharedFlowStore } from './store/useSharedFlowStore';
import { Sidebar } from './components/Sidebar';
import { EmptyState } from './components/EmptyState';
import { Toasts } from './components/Toasts';
import { SuggestionBanner } from './components/SuggestionBanner';
import { ProxyEditor } from './components/ProxyEditor';
import { SharedFlowEditor } from './components/SharedFlowEditor';
import { WorkspaceView } from './components/WorkspaceView';
import { CommandPalette } from './components/CommandPalette';
import { useUiStore } from './store/useUiStore';
import { useWorkspaceStore } from './store/useWorkspaceStore';

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

  useEffect(() => {
    bootstrap();
    refreshSharedFlows();
  }, [bootstrap, refreshSharedFlows]);

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
    <div className="shell">
      <Sidebar />
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
      <Toasts />
      <SuggestionBanner />
      <CommandPalette />
    </div>
  );
}
