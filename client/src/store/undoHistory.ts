/**
 * Undo/redo for the one document a store edits (`currentProxy` /
 * `currentSharedFlow`).
 *
 * Both stores already treat that document as immutable: every edit ends in
 * `set({ <docKey>: <a brand-new object>, dirty: true })`. That gives us two
 * things for free, and the whole design leans on them:
 *
 *   1. Reference inequality on the document IS the "something changed" signal,
 *      so no action needs to opt in — wrapping `set` catches all ~50 edit sites
 *      at once, and new ones are covered the day they're written.
 *   2. `dirty: true` in the applied partial distinguishes a user edit from a
 *      load boundary (open / save / restore), which also replace the document
 *      wholesale but must not become undo steps. Undoing a *save* would be
 *      nonsense; undoing across one is not, so a save leaves the stacks alone.
 *
 * Snapshots are whole documents rather than patches. These are small JSON trees
 * (tens of KB) and structurally shared with the live one — every unedited
 * subtree is the same object — so a bounded stack of them costs far less than
 * the memory arithmetic suggests, and restoring is a single assignment that
 * can't drift out of sync with a patch-application bug.
 */

/**
 * What the host store must declare: the depth counters (so controls re-render
 * when they change) and `dirty`, which is not ours but is the flag we read to
 * tell a user edit from a load boundary.
 */
export interface UndoSlice {
  /** Owned by the host store; listed here because recording depends on reading it. */
  dirty: boolean;
  /** Number of undo steps available. `> 0` means the Undo control is live. */
  undoDepth: number;
  /** Number of redo steps available. */
  redoDepth: number;
  undo: () => void;
  redo: () => void;
  /**
   * Drops both stacks. Call after replacing the document with unrelated
   * content that isn't an edit and isn't a different document either — a
   * history restore being the case that exists today. Without it, the top of
   * the undo stack would be a pre-restore state whose only relationship to
   * what's now on screen is that it belongs to the same proxy, and applying it
   * would silently throw the restore away.
   */
  clearUndoHistory: () => void;
}

type Setter<S> = (partial: Partial<S> | ((state: S) => Partial<S>), replace?: false) => void;

interface Options<S extends UndoSlice, K extends keyof S> {
  /** Key holding the edited document. */
  docKey: K;
  /** Stable identity of a document, used to detect "a different one was loaded". */
  idOf: (doc: NonNullable<S[K]>) => string;
  /** zustand's own `set`, unwrapped. */
  rawSet: Setter<S>;
  get: () => S;
  /** Max undo steps kept. Oldest are dropped first. */
  limit?: number;
  /** Edits with the same signature closer together than this collapse into one step. */
  coalesceMs?: number;
}

/** Depth past which a changed subtree is summarized rather than walked further. */
const MAX_WALK_DEPTH = 6;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Walks the changed parts of two documents, building a fingerprint of *what*
 * changed and reporting whether the change was structural.
 *
 * Identity pruning does the heavy lifting: unchanged subtrees are the same
 * object, so `b === a` cuts the walk off immediately and only the edited path
 * is ever visited.
 *
 * `structural` is set when a list gained, lost, or reordered elements. Those
 * come from discrete actions (add a policy, delete a flow, move a step) where
 * every click is its own thing the user expects to undo one at a time — the
 * opposite of a run of keystrokes.
 */
function walkChange(b: unknown, a: unknown, depth: number, found: { structural: boolean }): string {
  if (b === a) return '';

  if (Array.isArray(b) && Array.isArray(a)) {
    if (b.length !== a.length) {
      found.structural = true;
      return '#';
    }
    // Same length, but an element moved: the item now at this index is one that
    // was already in the old array, so nothing was *edited* — the list was
    // reordered. An element edited in place fails this test, because an edit
    // produces a brand-new object that appears nowhere in the old array.
    const previous = new Set(b);
    const parts: string[] = [];
    for (let i = 0; i < a.length; i++) {
      if (b[i] === a[i]) continue;
      if (previous.has(a[i])) found.structural = true;
      const id = (a[i] as { id?: string })?.id ?? String(i);
      const inner = depth < MAX_WALK_DEPTH ? walkChange(b[i], a[i], depth + 1, found) : '';
      parts.push(inner ? `${id}{${inner}}` : id);
    }
    return parts.join(',');
  }

  if (isPlainObject(b) && isPlainObject(a)) {
    if (depth >= MAX_WALK_DEPTH) return '*';
    const parts: string[] = [];
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (b[key] === a[key]) continue;
      const inner = walkChange(b[key], a[key], depth + 1, found);
      parts.push(inner ? `${key}[${inner}]` : key);
    }
    return parts.sort().join('|');
  }

  // A differing primitive: the parent already names the field that changed.
  return '';
}

/**
 * A fingerprint of what changed between two documents, used to collapse a burst
 * of edits to the same thing into one undo step — or `null` for a change that
 * must never collapse into a neighbour.
 *
 * Granularity is one object: a run of keystrokes in a policy's XML fingerprints
 * as `policies[<id>]` every time and collapses, while switching to a different
 * policy — or to a different field group entirely — yields a different
 * fingerprint and starts a new step. Two different fields of the *same* object
 * typed inside the window do collapse together; that is the trade every editor
 * makes, and it beats one undo step per character.
 *
 * `null` covers anything structural, at any depth: adding two environments in
 * quick succession fingerprints identically both times, and collapsing them
 * would make one Undo silently discard both.
 */
function changeSignature(before: unknown, after: unknown): string | null {
  if (!isPlainObject(before) || !isPlainObject(after)) return null;
  const found = { structural: false };
  const signature = walkChange(before, after, 0, found);
  return found.structural ? null : signature;
}

/**
 * Returns a `set` to use in place of zustand's inside the store creator, plus
 * the slice of state/actions to spread into the store's initial object.
 */
export function createUndoHistory<S extends UndoSlice, K extends keyof S>(opts: Options<S, K>) {
  const { docKey, idOf, rawSet, get } = opts;
  const limit = opts.limit ?? 80;
  const coalesceMs = opts.coalesceMs ?? 600;

  let past: S[K][] = [];
  let future: S[K][] = [];
  /** True while undo/redo is writing, so its own `set` isn't recorded as an edit. */
  let applying = false;
  let lastSignature = '';
  let lastRecordedAt = 0;

  const syncDepths = () => {
    rawSet({ undoDepth: past.length, redoDepth: future.length } as Partial<S>);
  };

  const reset = () => {
    past = [];
    future = [];
    lastSignature = '';
    lastRecordedAt = 0;
    syncDepths();
  };

  const set: Setter<S> = (partial, replace) => {
    // Updater functions are resolved here rather than handed to zustand, so the
    // applied partial can be inspected for `dirty` without running the updater
    // twice. Every call site in this codebase passes a plain object; the
    // function form is supported for completeness and is pure where used.
    const state = get() as S | undefined;
    const resolved = (typeof partial === 'function' ? partial(state as S) : partial) as Partial<S>;
    const before = state ? state[docKey] : undefined;

    rawSet(resolved, replace);

    if (applying) return;
    const after = get()[docKey];
    if (before === after) return;

    const beforeId = before ? idOf(before as NonNullable<S[K]>) : null;
    const afterId = after ? idOf(after as NonNullable<S[K]>) : null;
    // A different document (or none) is now open: nothing on the stacks applies
    // to it. Covers open, close, and delete-the-open-one.
    if (beforeId !== afterId) {
      reset();
      return;
    }

    // Same document, replaced without being dirtied — a save round-tripping
    // through the server. Not a step, but not a reason to forget earlier ones.
    if (resolved.dirty !== true) return;

    // `null` means structural — never folded into the step before it.
    const signature = changeSignature(before, after);
    const coalescable = signature !== null && signature !== '';
    const now = Date.now();
    if (coalescable && signature === lastSignature && now - lastRecordedAt < coalesceMs) {
      // Folded into the step already on the stack. The window is refreshed from
      // the latest keystroke so continuous typing stays one step however long
      // it runs, and any redo path is still dead.
      lastRecordedAt = now;
      if (future.length) {
        future = [];
        syncDepths();
      }
      return;
    }

    // A non-coalescable change leaves an empty marker, which the guard above
    // can never match — so the next edit always starts a fresh step.
    lastSignature = coalescable ? signature : '';
    lastRecordedAt = now;
    past = [...past.slice(-(limit - 1)), before as S[K]];
    future = [];
    syncDepths();
  };

  const apply = (doc: S[K]) => {
    applying = true;
    try {
      // `dirty: true` unconditionally: the document now differs from what was
      // last saved. Undoing back to exactly the saved state does leave the dot
      // showing, which errs toward offering a redundant save over hiding a real
      // unsaved change.
      rawSet({ [docKey]: doc, dirty: true } as unknown as Partial<S>);
    } finally {
      applying = false;
    }
    // Any coalescing run is over — the next edit starts a fresh step even if it
    // touches the same field within the window.
    lastSignature = '';
    lastRecordedAt = 0;
    syncDepths();
  };

  // `dirty` is the host store's to declare and initialize, not ours.
  const slice: Omit<UndoSlice, 'dirty'> = {
    undoDepth: 0,
    redoDepth: 0,

    undo() {
      if (!past.length) return;
      const prev = past[past.length - 1];
      past = past.slice(0, -1);
      future = [...future, get()[docKey]];
      apply(prev);
    },

    redo() {
      if (!future.length) return;
      const next = future[future.length - 1];
      future = future.slice(0, -1);
      past = [...past, get()[docKey]];
      apply(next);
    },

    clearUndoHistory: reset,
  };

  return { set, slice };
}
