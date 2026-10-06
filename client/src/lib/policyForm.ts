import type { PolicyField, PolicySchema } from './policySchema';

export type FieldValue =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; mode: 'literal' | 'variable'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'attr'; value: string }
  | { kind: 'kv-list'; items: { name: string; value: string }[] }
  | { kind: 'string-list'; items: string[] }
  | { kind: 'element'; attrs: Record<string, string>; text: string }
  | { kind: 'ip-rules'; rules: { action: 'ALLOW' | 'DENY'; mask: string; address: string }[] }
  | { kind: 'assign-variables'; items: { name: string; mode: AssignVariableMode; value: string }[] }
  | { kind: 'named-items'; items: NamedItem[] };

/** One repeating element: its own attributes, plus the values it holds. */
export interface NamedItem {
  attrs: Record<string, string>;
  values: { text: string; attrs: Record<string, string> }[];
}

/** <AssignVariable>'s three mutually exclusive sources, in doc precedence order. */
export type AssignVariableMode = 'Value' | 'Ref' | 'Template';
export const ASSIGN_VARIABLE_MODES: AssignVariableMode[] = ['Value', 'Ref', 'Template'];

export interface PolicyFormState {
  common: {
    displayName: string;
    enabled: boolean;
    continueOnError: boolean;
    rootAttrValues: Record<string, string>;
  };
  fields: Record<string, FieldValue>;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function findChild(el: Element, tag: string): Element | null {
  for (let i = 0; i < el.children.length; i++) {
    if (el.children[i].tagName === tag) return el.children[i];
  }
  return null;
}

function findPath(root: Element, path: string[]): Element | null {
  let cur: Element | null = root;
  for (const seg of path) {
    if (!cur) return null;
    cur = findChild(cur, seg);
  }
  return cur;
}

function textOf(el: Element | null): string {
  return el ? (el.textContent || '').trim() : '';
}

function readField(root: Element, f: PolicyField): FieldValue {
  switch (f.type) {
    case 'text':
    case 'number': {
      const el = findPath(root, f.path);
      return { kind: 'text', value: el ? textOf(el) : f.default ?? '' };
    }
    case 'ref': {
      const el = findPath(root, f.path);
      if (!el) return { kind: 'ref', mode: 'literal', value: f.default ?? '' };
      const ref = el.getAttribute('ref');
      if (ref) return { kind: 'ref', mode: 'variable', value: ref };
      return { kind: 'ref', mode: 'literal', value: textOf(el) || f.default || '' };
    }
    case 'boolean': {
      const el = findPath(root, f.path);
      const raw = el ? textOf(el) : f.default ?? 'false';
      return { kind: 'boolean', value: raw === 'true' };
    }
    case 'select': {
      const el = findPath(root, f.path);
      return { kind: 'text', value: el ? textOf(el) : f.default ?? f.options[0] };
    }
    case 'attr': {
      const el = f.path.length ? findPath(root, f.path) : root;
      return { kind: 'attr', value: el?.getAttribute(f.attr) ?? f.default ?? '' };
    }
    case 'attr-boolean': {
      const el = f.path.length ? findPath(root, f.path) : root;
      const raw = el?.getAttribute(f.attr) ?? f.default ?? 'false';
      return { kind: 'boolean', value: raw === 'true' };
    }
    case 'attr-select': {
      const el = f.path.length ? findPath(root, f.path) : root;
      return { kind: 'attr', value: el?.getAttribute(f.attr) ?? f.default ?? f.options[0] };
    }
    case 'kv-list': {
      const parent = findPath(root, f.path);
      const items: { name: string; value: string }[] = [];
      if (parent) {
        Array.from(parent.children).forEach((child) => {
          if (child.tagName !== f.itemTag) return;
          if (f.keyTag && f.valueTag) {
            items.push({ name: textOf(findChild(child, f.keyTag)), value: textOf(findChild(child, f.valueTag)) });
          } else {
            items.push({ name: child.getAttribute(f.nameAttr || 'name') || '', value: textOf(child) });
          }
        });
      }
      return { kind: 'kv-list', items };
    }
    case 'named-items': {
      const parent = f.path.length ? findPath(root, f.path) : root;
      const items: NamedItem[] = [];
      if (parent) {
        Array.from(parent.children).forEach((child) => {
          if (child.tagName !== f.itemTag) return;
          const attrs: Record<string, string> = {};
          (f.itemAttrs || []).forEach((a) => {
            attrs[a.name] = child.getAttribute(a.name) ?? '';
          });
          // Without a valueTag the item carries its own text, so there is
          // exactly one value and it has no attributes of its own.
          const values = f.valueTag
            ? Array.from(child.children)
                .filter((v) => v.tagName === f.valueTag)
                .map((v) => {
                  const vAttrs: Record<string, string> = {};
                  (f.valueAttrs || []).forEach((a) => {
                    vAttrs[a.name] = v.getAttribute(a.name) ?? '';
                  });
                  return { text: textOf(v), attrs: vAttrs };
                })
            : [{ text: textOf(child), attrs: {} }];
          items.push({ attrs, values: values.length ? values : [{ text: '', attrs: {} }] });
        });
      }
      return { kind: 'named-items', items };
    }
    case 'assign-variables': {
      const parent = f.path.length ? findPath(root, f.path) : root;
      const items: { name: string; mode: AssignVariableMode; value: string }[] = [];
      if (parent) {
        Array.from(parent.children).forEach((child) => {
          if (child.tagName !== f.itemTag) return;
          const name = textOf(findChild(child, 'Name'));
          // Ref and Template can carry their value as an attribute instead of
          // text (<Template ref='...'/>), so check both.
          const mode = ASSIGN_VARIABLE_MODES.find((m) => findChild(child, m)) ?? 'Value';
          const el = findChild(child, mode);
          const value = el ? el.getAttribute('ref') || textOf(el) : '';
          items.push({ name, mode, value });
        });
      }
      return { kind: 'assign-variables', items };
    }
    case 'string-list': {
      const parent = findPath(root, f.path);
      const items: string[] = [];
      if (parent) {
        Array.from(parent.children).forEach((child) => {
          if (child.tagName === f.itemTag) items.push(f.asAttr ? child.getAttribute(f.attrName || 'name') || '' : textOf(child));
        });
      }
      return { kind: 'string-list', items };
    }
    case 'element': {
      const el = findPath(root, f.path);
      const attrs: Record<string, string> = {};
      (f.attrs || []).forEach((a) => {
        attrs[a.name] = el?.getAttribute(a.name) ?? a.default ?? '';
      });
      return { kind: 'element', attrs, text: el ? textOf(el) : '' };
    }
    case 'ip-rules': {
      const parent = findPath(root, f.path);
      const rules: { action: 'ALLOW' | 'DENY'; mask: string; address: string }[] = [];
      if (parent) {
        Array.from(parent.children).forEach((child) => {
          if (child.tagName !== 'MatchRule') return;
          const action = child.getAttribute('action') === 'DENY' ? 'DENY' : 'ALLOW';
          const addrEl = findChild(child, 'SourceAddress');
          rules.push({ action, mask: addrEl?.getAttribute('mask') || '', address: textOf(addrEl) });
        });
      }
      return { kind: 'ip-rules', rules };
    }
    default:
      return { kind: 'text', value: '' };
  }
}

export function parsePolicyXml(xml: string, schema: PolicySchema): PolicyFormState | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== schema.rootTag || doc.getElementsByTagName('parsererror').length > 0) return null;

  const rootAttrValues: Record<string, string> = {};
  (schema.rootAttrs || []).forEach((a) => {
    rootAttrValues[a.name] = root.getAttribute(a.name) ?? a.default ?? '';
  });

  const fields: Record<string, FieldValue> = {};
  schema.sections.forEach((s) => s.fields.forEach((f) => (fields[f.id] = readField(root, f))));

  return {
    common: {
      displayName: textOf(findChild(root, 'DisplayName')),
      enabled: (root.getAttribute('enabled') ?? 'true') !== 'false',
      continueOnError: root.getAttribute('continueOnError') === 'true',
      rootAttrValues,
    },
    fields,
  };
}

export function defaultFormState(schema: PolicySchema): PolicyFormState {
  const rootAttrValues: Record<string, string> = {};
  (schema.rootAttrs || []).forEach((a) => (rootAttrValues[a.name] = a.default ?? ''));

  const fields: Record<string, FieldValue> = {};
  schema.sections.forEach((s) =>
    s.fields.forEach((f) => {
      switch (f.type) {
        case 'text':
        case 'number':
          fields[f.id] = { kind: 'text', value: f.default ?? '' };
          break;
        case 'ref':
          fields[f.id] = { kind: 'ref', mode: 'literal', value: f.default ?? '' };
          break;
        case 'boolean':
          fields[f.id] = { kind: 'boolean', value: (f.default ?? 'false') === 'true' };
          break;
        case 'select':
          fields[f.id] = { kind: 'text', value: f.default ?? f.options[0] };
          break;
        case 'attr':
          fields[f.id] = { kind: 'attr', value: f.default ?? '' };
          break;
        case 'attr-boolean':
          fields[f.id] = { kind: 'boolean', value: (f.default ?? 'false') === 'true' };
          break;
        case 'attr-select':
          fields[f.id] = { kind: 'attr', value: f.default ?? f.options[0] };
          break;
        case 'kv-list':
          fields[f.id] = { kind: 'kv-list', items: [] };
          break;
        case 'string-list':
          fields[f.id] = { kind: 'string-list', items: [] };
          break;
        case 'element': {
          const attrs: Record<string, string> = {};
          (f.attrs || []).forEach((a) => (attrs[a.name] = a.default ?? ''));
          fields[f.id] = { kind: 'element', attrs, text: '' };
          break;
        }
        case 'ip-rules':
          fields[f.id] = { kind: 'ip-rules', rules: [] };
          break;
        case 'assign-variables':
          fields[f.id] = { kind: 'assign-variables', items: [] };
          break;
        case 'named-items':
          fields[f.id] = { kind: 'named-items', items: [] };
          break;
      }
    })
  );

  return {
    common: { displayName: '', enabled: true, continueOnError: false, rootAttrValues },
    fields,
  };
}

// ---------------------------------------------------------------- Serializing

interface XNode {
  tag: string;
  attrs: [string, string][];
  children: XNode[];
  text?: string;
}

function makeNode(tag: string): XNode {
  return { tag, attrs: [], children: [] };
}

function getOrCreateChild(parent: XNode, tag: string): XNode {
  let existing = parent.children.find((c) => c.tag === tag);
  if (!existing) {
    existing = makeNode(tag);
    parent.children.push(existing);
  }
  return existing;
}

function resolvePath(root: XNode, path: string[]): XNode {
  let cur = root;
  for (const seg of path) cur = getOrCreateChild(cur, seg);
  return cur;
}

/** Walks a path without creating anything — null if any segment is missing. */
function findNode(root: XNode, path: string[]): XNode | null {
  let cur: XNode | undefined = root;
  for (const seg of path) {
    cur = cur.children.find((c) => c.tag === seg);
    if (!cur) return null;
  }
  return cur;
}

function setAttr(node: XNode, name: string, value: string) {
  const existing = node.attrs.find(([k]) => k === name);
  if (existing) existing[1] = value;
  else node.attrs.push([name, value]);
}

function removeAttr(node: XNode, name: string) {
  const i = node.attrs.findIndex(([k]) => k === name);
  if (i >= 0) node.attrs.splice(i, 1);
}

/**
 * The policy's existing XML, as a tree we can patch in place. Keeping the
 * original elements — rather than regenerating the whole policy from the
 * schema — is what stops an edit to one field from deleting the elements the
 * schema doesn't model (<AssignVariable>, <SSLInfo>, and plenty more).
 */
function parseBaseXml(xml: string, schema: PolicySchema): XNode | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== schema.rootTag || doc.getElementsByTagName('parsererror').length > 0) return null;
  return elementToXNode(root);
}

function elementToXNode(el: Element): XNode {
  const node = makeNode(el.tagName);
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    node.attrs.push([a.name, a.value]);
  }
  const kids = Array.from(el.children);
  if (kids.length) node.children = kids.map(elementToXNode);
  else {
    const text = (el.textContent || '').trim();
    if (text) node.text = text;
  }
  return node;
}

/**
 * Removes just what `f` owns, so the following write replaces the field's old
 * value instead of duplicating it — and so clearing a field in the form
 * actually clears it in the XML. Deliberately surgical: an `element` field
 * drops only its declared attributes and text, because other fields' values
 * can live underneath the same node (ServiceCallout's <Request>, for one).
 */
/**
 * Where a cleared field's elements used to sit, so the rewrite can put them
 * back there instead of at the end.
 *
 * Appending would be harmless for a policy Apigee reads as a set, but
 * AssignMessage executes <Remove>, <Set> and <Add> in document order, and
 * nobody wants a one-word edit to reshuffle their file either way.
 */
interface ClearAnchor {
  parent: XNode;
  index: number;
}

/** Removes `tags` from `parent`, reporting where the first one was. */
function removeChildren(parent: XNode, matches: (c: XNode) => boolean): ClearAnchor | null {
  const index = parent.children.findIndex(matches);
  if (index === -1) return null;
  parent.children = parent.children.filter((c) => !matches(c));
  return { parent, index };
}

function clearField(root: XNode, f: PolicyField): ClearAnchor | null {
  switch (f.type) {
    case 'attr':
    case 'attr-boolean':
    case 'attr-select': {
      const node = f.path.length ? findNode(root, f.path) : root;
      if (node) removeAttr(node, f.attr);
      return null;
    }
    case 'kv-list':
    case 'string-list':
    case 'assign-variables':
    case 'named-items': {
      const parent = f.path.length ? findNode(root, f.path) : root;
      return parent ? removeChildren(parent, (c) => c.tag === f.itemTag) : null;
    }
    case 'ip-rules': {
      const parent = findNode(root, f.path);
      return parent ? removeChildren(parent, (c) => c.tag === 'MatchRule') : null;
    }
    case 'element': {
      const node = findNode(root, f.path);
      if (!node) return null;
      (f.attrs || []).forEach((a) => removeAttr(node, a.name));
      delete node.text;
      return null;
    }
    default: {
      // Leaf-valued fields (text/number/select/boolean/ref) own their element.
      const parent = f.path.length > 1 ? findNode(root, f.path.slice(0, -1)) : root;
      const tag = f.path[f.path.length - 1];
      if (!parent || !tag) return null;
      return removeChildren(parent, (c) => c.tag === tag);
    }
  }
}

/** Moves whatever the rewrite appended back to where the old value was. */
function restorePosition(anchor: ClearAnchor | null, lengthAfterClear: number) {
  if (!anchor) return;
  const { parent, index } = anchor;
  const added = parent.children.splice(lengthAfterClear);
  if (added.length) parent.children.splice(index, 0, ...added);
}

/** Drops containers along `path` that the write left with nothing in them. */
function pruneEmptyAlongPath(root: XNode, path: string[]) {
  for (let depth = path.length; depth > 0; depth--) {
    const parent = depth > 1 ? findNode(root, path.slice(0, depth - 1)) : root;
    if (!parent) continue;
    const tag = path[depth - 1];
    parent.children = parent.children.filter((c) => c.tag !== tag || c.children.length > 0 || c.text || c.attrs.length > 0);
  }
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serialize(node: XNode, depth: number): string {
  const pad = '    '.repeat(depth);
  const attrStr = node.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  const hasChildren = node.children.length > 0;
  const hasText = !!node.text;
  if (!hasChildren && !hasText) return `${pad}<${node.tag}${attrStr}/>`;
  if (hasText && !hasChildren) return `${pad}<${node.tag}${attrStr}>${escText(node.text!)}</${node.tag}>`;
  const inner = node.children.map((c) => serialize(c, depth + 1)).join('\n');
  return `${pad}<${node.tag}${attrStr}>\n${inner}\n${pad}</${node.tag}>`;
}

function writeField(root: XNode, f: PolicyField, value: FieldValue) {
  switch (f.type) {
    case 'text':
    case 'number': {
      if (value.kind !== 'text') return;
      if (!value.value && !f.required) return;
      resolvePath(root, f.path).text = value.value;
      break;
    }
    case 'ref': {
      if (value.kind !== 'ref') return;
      if (!value.value && !f.required) return;
      const node = resolvePath(root, f.path);
      if (value.mode === 'variable') node.attrs.push(['ref', value.value]);
      else node.text = value.value;
      break;
    }
    case 'boolean': {
      if (value.kind !== 'boolean') return;
      if (f.omitIfDefault && String(value.value) === (f.default ?? 'false')) return;
      resolvePath(root, f.path).text = String(value.value);
      break;
    }
    case 'select': {
      if (value.kind !== 'text' || !value.value) return;
      resolvePath(root, f.path).text = value.value;
      break;
    }
    case 'attr': {
      if (value.kind !== 'attr' || !value.value) return;
      resolvePath(root, f.path).attrs.push([f.attr, value.value]);
      break;
    }
    case 'attr-boolean': {
      if (value.kind !== 'boolean') return;
      resolvePath(root, f.path).attrs.push([f.attr, String(value.value)]);
      break;
    }
    case 'attr-select': {
      if (value.kind !== 'attr' || !value.value) return;
      resolvePath(root, f.path).attrs.push([f.attr, value.value]);
      break;
    }
    case 'kv-list': {
      if (value.kind !== 'kv-list') return;
      const items = value.items.filter((it) => it.name.trim() || it.value.trim());
      if (!items.length) return;
      const parent = resolvePath(root, f.path);
      items.forEach((it) => {
        const node = makeNode(f.itemTag);
        if (f.keyTag && f.valueTag) {
          const key = makeNode(f.keyTag);
          key.text = it.name;
          const val = makeNode(f.valueTag);
          val.text = it.value;
          node.children.push(key, val);
        } else {
          node.attrs.push([f.nameAttr || 'name', it.name]);
          node.text = it.value;
        }
        parent.children.push(node);
      });
      break;
    }
    case 'named-items': {
      if (value.kind !== 'named-items') return;
      const nonEmpty = value.items.filter(
        (it) => Object.values(it.attrs).some((v) => v.trim()) || it.values.some((v) => v.text.trim())
      );
      if (!nonEmpty.length) return;
      const parent = f.path.length ? resolvePath(root, f.path) : root;
      nonEmpty.forEach((it) => {
        const node = makeNode(f.itemTag);
        (f.itemAttrs || []).forEach((a) => {
          const v = it.attrs[a.name];
          if (v !== undefined && v !== '') node.attrs.push([a.name, v]);
        });
        if (!f.valueTag) {
          if (it.values[0]?.text) node.text = it.values[0].text;
        } else {
          it.values
            .filter((v) => v.text.trim())
            .forEach((v) => {
              const valueNode = makeNode(f.valueTag!);
              (f.valueAttrs || []).forEach((a) => {
                const av = v.attrs[a.name];
                if (av !== undefined && av !== '') valueNode.attrs.push([a.name, av]);
              });
              valueNode.text = v.text;
              node.children.push(valueNode);
            });
        }
        parent.children.push(node);
      });
      break;
    }
    case 'assign-variables': {
      if (value.kind !== 'assign-variables') return;
      const items = value.items.filter((it) => it.name.trim());
      if (!items.length) return;
      const parent = f.path.length ? resolvePath(root, f.path) : root;
      items.forEach((it) => {
        const node = makeNode(f.itemTag);
        const name = makeNode('Name');
        name.text = it.name;
        node.children.push(name);
        const source = makeNode(it.mode);
        source.text = it.value;
        node.children.push(source);
        parent.children.push(node);
      });
      break;
    }
    case 'string-list': {
      if (value.kind !== 'string-list') return;
      const items = value.items.filter((v) => v.trim());
      if (!items.length) return;
      const parent = resolvePath(root, f.path);
      items.forEach((v) => {
        const node = makeNode(f.itemTag);
        if (f.asAttr) node.attrs.push([f.attrName || 'name', v]);
        else node.text = v;
        parent.children.push(node);
      });
      break;
    }
    case 'element': {
      if (value.kind !== 'element') return;
      const hasAnyAttr = (f.attrs || []).some((a) => {
        const v = value.attrs[a.name];
        const def = a.default ?? (a.kind === 'boolean' ? 'false' : '');
        return v !== undefined && v !== '' && v !== def;
      });
      if (!hasAnyAttr && !value.text && !f.required) return;
      const node = resolvePath(root, f.path);
      (f.attrs || []).forEach((a) => {
        const v = value.attrs[a.name];
        const def = a.default ?? (a.kind === 'boolean' ? 'false' : '');
        if (v !== undefined && v !== '' && v !== def) node.attrs.push([a.name, v]);
      });
      if (value.text) node.text = value.text;
      break;
    }
    case 'ip-rules': {
      if (value.kind !== 'ip-rules') return;
      const rules = value.rules.filter((r) => r.address.trim());
      if (!rules.length) return;
      const parent = resolvePath(root, f.path);
      rules.forEach((r) => {
        const rule = makeNode('MatchRule');
        rule.attrs.push(['action', r.action]);
        const addr = makeNode('SourceAddress');
        if (r.mask) addr.attrs.push(['mask', r.mask]);
        addr.text = r.address;
        rule.children.push(addr);
        parent.children.push(rule);
      });
      break;
    }
  }
}

/** Dirty key for a root attribute, kept in the same set as the field ids. */
export function rootAttrDirtyKey(name: string): string {
  return `@attr:${name}`;
}

export const DISPLAY_NAME_DIRTY_KEY = '@displayName';

/**
 * Serializes the form back to XML.
 *
 * `baseXml` is the policy's current XML, and `dirty` the ids of the fields the
 * user has actually touched (plus `rootAttrDirtyKey(...)` entries for root
 * attributes). Everything else is left exactly as the base had it: untouched
 * fields are neither rewritten nor defaulted, so opening the visual editor and
 * changing one header can't inject a <Set><Verb> the user never asked for, nor
 * drop the elements this schema doesn't model.
 *
 * Omit `baseXml` (or `dirty`) to write the whole policy from the form — that's
 * the fallback for XML we couldn't map onto the schema at all, where the editor
 * warns that editing replaces the policy.
 */
export function buildPolicyXml(policyName: string, form: PolicyFormState, schema: PolicySchema, baseXml?: string, dirty?: ReadonlySet<string>): string {
  const base = baseXml ? parseBaseXml(baseXml, schema) : null;
  const root = base ?? makeNode(schema.rootTag);
  const writeAll = !base || !dirty;

  // `async` is deprecated for every policy type; never carry it forward.
  removeAttr(root, 'async');
  setAttr(root, 'continueOnError', String(form.common.continueOnError));
  setAttr(root, 'enabled', String(form.common.enabled));
  (schema.rootAttrs || []).forEach((a) => {
    if (!writeAll && !dirty!.has(rootAttrDirtyKey(a.name))) return;
    const v = form.common.rootAttrValues[a.name] ?? '';
    if (v === '') removeAttr(root, a.name);
    else setAttr(root, a.name, v);
  });
  setAttr(root, 'name', policyName);

  const existingDisplayName = findNode(root, ['DisplayName']);
  if (writeAll || dirty!.has(DISPLAY_NAME_DIRTY_KEY) || existingDisplayName) {
    const displayNameNode = existingDisplayName ?? makeNode('DisplayName');
    if (!existingDisplayName) root.children.unshift(displayNameNode);
    displayNameNode.text = form.common.displayName || policyName;
  }

  schema.sections.forEach((section) => {
    section.fields.forEach((f) => {
      if (!writeAll && !dirty!.has(f.id)) return;
      const value = form.fields[f.id];
      // A form built before this field existed simply has nothing to say about
      // it; leave whatever the base XML had rather than throwing.
      if (!value) return;
      const anchor = clearField(root, f);
      const lengthAfterClear = anchor ? anchor.parent.children.length : 0;
      writeField(root, f, value);
      restorePosition(anchor, lengthAfterClear);
      pruneEmptyAlongPath(root, f.path);
    });
  });

  return XML_HEADER + serialize(root, 0);
}
