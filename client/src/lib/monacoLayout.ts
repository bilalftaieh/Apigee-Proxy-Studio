import type { IDisposable, editor as MonacoEditorNs } from 'monaco-editor';

/**
 * The options every code editor in this app is mounted with.
 *
 * Shared rather than repeated because it was repeated: three identical literals
 * in three files, including the six-line explanation below, which is how the
 * next editor added would have got two of the three settings and none of the
 * reasoning. Exported as one frozen object, so React hands Monaco the same
 * reference on every render instead of a fresh literal that looks like a
 * change and triggers an `updateOptions` call.
 */
export const EDITOR_OPTIONS: MonacoEditorNs.IStandaloneEditorConstructionOptions = Object.freeze({
  fontSize: 13,
  fontFamily: 'JetBrains Mono, monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  // Renders the suggest/hover popups in a fixed-position container on <body>
  // instead of inside the editor's own overflow box. These editors sit inside
  // three `overflow: hidden` ancestors (.policy-editor, .main, .shell), which
  // otherwise clip a completion list taller than the editor pane — the list is
  // there, but cut off or invisible.
  //
  // The other half of that same bug is below: a popup that is positioned
  // correctly but sized from a stale measurement is just as unusable.
  fixedOverflowWidgets: true,
  padding: { top: 14 },
  renderLineHighlight: 'none',
});

/**
 * Keeps a Monaco editor's measured size in step with the box it is drawn in.
 *
 * Monaco's own `automaticLayout` is supposed to do this, and mostly does — but
 * it can settle on a stale measurement and never recover, leaving
 * `editor.getLayoutInfo()` reporting a few pixels square while the editor is
 * plainly drawn at full size. Text still renders (the DOM is laid out by CSS,
 * not by Monaco), so the breakage is invisible until something *asks* Monaco how
 * big it is.
 *
 * The suggest widget does exactly that: it sizes its label column from
 * `getLayoutInfo().width`. Against a 5x5 layout the column collapses, and every
 * completion renders as an icon with no text beside it — which looks like a
 * broken completion provider and is really a broken measurement.
 *
 * Rather than diagnose why the built-in observer gave up, this measures the
 * container directly and tells Monaco the answer. Cheap, and it cannot get
 * stuck: a zero-sized reading is ignored rather than written, so a hidden or
 * unmounted panel never poisons the stored dimensions.
 *
 * Cleanup is automatic. The returned detach function is there for a caller that
 * wants to stop early, but it does not have to be called: the observer is also
 * torn down when the editor itself is disposed, which is what `@monaco-editor/
 * react` does on unmount. A caller that drops the return value therefore leaks
 * nothing — the alternative, a `ResizeObserver` still holding a detached
 * container and the editor closure behind it, is silent and easy to ship.
 */
export function attachLayoutFallback(editor: MonacoEditorNs.IStandaloneCodeEditor): () => void {
  const container = editor.getContainerDomNode();

  const relayout = () => {
    const { width, height } = container.getBoundingClientRect();
    // A collapsed reading means the panel is hidden, not that the editor is
    // tiny. Writing it would be the very bug this guards against.
    if (width < 1 || height < 1) return;
    const current = editor.getLayoutInfo();
    if (Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1) return;
    editor.layout({ width: Math.round(width), height: Math.round(height) });
  };

  relayout();
  // A second pass after the first paint: on mount the container is often still
  // being sized by its flex parents, so the immediate reading can be the wrong
  // one to keep.
  const raf = requestAnimationFrame(relayout);

  const observer = new ResizeObserver(relayout);
  observer.observe(container);

  let disposeListener: IDisposable | undefined;
  let detached = false;

  // Idempotent, because both paths can reach it: an explicit detach by the
  // caller and the editor's own disposal.
  const detach = () => {
    if (detached) return;
    detached = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    disposeListener?.dispose();
  };

  disposeListener = editor.onDidDispose(detach);

  return detach;
}
