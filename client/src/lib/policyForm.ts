import type { PolicyField, PolicySchema } from './policySchema';

export type FieldValue =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; mode: 'literal' | 'variable'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'attr'; value: string }
  | { kind: 'kv-list'; items: { name: string; value: string }[] }
  | { kind: 'string-list'; items: string[] }
  | { kind: 'element'; attrs: Record<string, string>; text: string }
  | { kind: 'ip-rules'; rules: { action: 'ALLOW' | 'DENY'; mask: string; address: string }[] };

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
          if (child.tagName === f.itemTag) items.push({ name: child.getAttribute(f.nameAttr || 'name') || '', value: textOf(child) });
        });
      }
      return { kind: 'kv-list', items };
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
        node.attrs.push([f.nameAttr || 'name', it.name]);
        node.text = it.value;
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

export function buildPolicyXml(policyName: string, form: PolicyFormState, schema: PolicySchema): string {
  const root = makeNode(schema.rootTag);
  root.attrs.push(['async', 'false']);
  root.attrs.push(['continueOnError', String(form.common.continueOnError)]);
  root.attrs.push(['enabled', String(form.common.enabled)]);
  (schema.rootAttrs || []).forEach((a) => {
    const v = form.common.rootAttrValues[a.name] ?? a.default ?? '';
    if (v !== '') root.attrs.push([a.name, v]);
  });
  root.attrs.push(['name', policyName]);

  const displayNameNode = makeNode('DisplayName');
  displayNameNode.text = form.common.displayName || policyName;
  root.children.push(displayNameNode);

  schema.sections.forEach((section) => {
    section.fields.forEach((f) => writeField(root, f, form.fields[f.id]));
  });

  return XML_HEADER + serialize(root, 0);
}
