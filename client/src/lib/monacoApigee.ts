/**
 * Apigee-aware completion and hover for the raw policy-XML editors.
 *
 * Monaco's providers are registered per *language*, not per editor, so this runs
 * once for the whole app and every `xml` model gets it. That means the providers
 * cannot be told which policy they are looking at — so they don't rely on being
 * told: the root tag is read out of the model itself. A model holding something
 * we have no catalogue for (a generated `<ProxyEndpoint>` in the XML Preview
 * tab, say) resolves to no element tree and the providers stay quiet, which is
 * the behaviour we want anyway.
 *
 * There are deliberately no diagnostics here. Our element catalogue covers about
 * half of Apigee's ~60 policy tags, so "unknown element" squiggles would fire on
 * perfectly valid XML in the uncovered half. Wrong red underlines in a file you
 * are about to ship cost more than absent ones. `fastLint.ts` keeps the checks
 * that can be made without a complete schema.
 */

import type { BeforeMount, Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorNs, languages, Position } from 'monaco-editor';
import { defineApigeeTheme } from './monacoTheme';
import { FALLBACK_ROOT_CHILDREN, UNIVERSAL_ROOT_ATTRS, getPolicyElementTree, policyDocUrl, type XmlAttrDef, type XmlElementDef } from './policyXmlSchema';
import { flowVariablesFor, type FlowVariableDef } from './flowVariables';
import { useStore } from '../store/useStore';
import { useSharedFlowStore } from '../store/useSharedFlowStore';

interface PolicyLike {
  name: string;
  xml: string;
}

/** Policies of whichever document is open — the source for harvested variables. */
function currentPolicies(): PolicyLike[] {
  const sharedFlow = useSharedFlowStore.getState().currentSharedFlow;
  if (sharedFlow) return sharedFlow.policies;
  return useStore.getState().currentProxy?.policies ?? [];
}

// Harvesting re-parses every policy's XML, so it is memoized on the identity of
// the policies array. Both stores are immutable, so that array is a new object
// exactly when a policy changed — which is exactly when the cache should miss.
const variableCache = new WeakMap<object, FlowVariableDef[]>();

function currentVariables(): FlowVariableDef[] {
  const policies = currentPolicies();
  const cached = variableCache.get(policies);
  if (cached) return cached;
  const computed = flowVariablesFor(policies);
  variableCache.set(policies, computed);
  return computed;
}

// ---------------------------------------------------------------------------
// Where in the XML are we?
// ---------------------------------------------------------------------------

type ContextKind = 'elementName' | 'closingTag' | 'attrName' | 'attrValue' | 'text';

interface XmlContext {
  kind: ContextKind;
  /** Root element name of the document, i.e. the policy type. */
  rootTag: string | null;
  /** Open elements from the root down to the one enclosing the cursor. */
  stack: string[];
  /** Name of the tag being typed, when the cursor sits inside a start tag. */
  tagName?: string;
  /** Attribute being given a value, in `attrValue` context. */
  attrName?: string;
  /** Partial identifier already typed at the cursor. */
  word: string;
  /** Cursor is inside a `{…}` variable reference. */
  inBraces: boolean;
}

/** Blanks out comments and the XML declaration so their contents can't be parsed as markup. */
function maskNonMarkup(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/<\?[\s\S]*?\?>/g, (m) => ' '.repeat(m.length));
}

/** Open-element stack implied by every complete tag before `offset`. */
function elementStack(masked: string, offset: number): { stack: string[]; rootTag: string | null } {
  const stack: string[] = [];
  let rootTag: string | null = null;
  const tagPattern = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(masked))) {
    // Only tags that are *complete* before the cursor count. Testing the end of
    // the match rather than its start is what keeps the tag the cursor is
    // currently inside off the stack — otherwise `<Variable |>` would resolve
    // attribute lookups against `Variable`'s own children instead of against the
    // parent that declares `Variable`.
    if (match.index + match[0].length > offset) break;
    const [, closing, name, , selfClosing] = match;
    if (closing) {
      // Tolerate mismatched closers rather than bailing: mid-edit XML is
      // routinely unbalanced, and completion has to keep working through it.
      const at = stack.lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }
    rootTag ||= name;
    if (!selfClosing) stack.push(name);
  }

  return { stack, rootTag: rootTag ?? firstTagOf(masked) };
}

function firstTagOf(masked: string): string | null {
  return masked.match(/<([A-Za-z_][\w.:-]*)/)?.[1] ?? null;
}

/**
 * The identifier already typed at the cursor, and so the span a completion
 * replaces. Braces are excluded on purpose: inside `{req.ti` the text to replace
 * is `req.ti`, and swallowing the `{` would have completion delete the brace
 * that put us in variable context to begin with.
 */
const WORD_PATTERN = /[\w.:-]+$/;

function partialWord(before: string): string {
  return before.match(WORD_PATTERN)?.[0] ?? '';
}

/** True when the cursor sits between a `{` and its unclosed `}`. */
function insideBraces(before: string): boolean {
  const open = before.lastIndexOf('{');
  if (open === -1) return false;
  const rest = before.slice(open + 1);
  return !rest.includes('}') && !rest.includes('<');
}

/**
 * Exported so the context classification can be checked directly. It is the
 * part of this file with real edge cases — a cursor inside an attribute value
 * that itself contains a `{…}` reference, an unbalanced tag mid-edit — and
 * driving those through the Monaco UI would test the widget, not the logic.
 */
export function analyzeXmlContext(text: string, offset: number): XmlContext {
  const masked = maskNonMarkup(text);
  const before = masked.slice(0, offset);
  const { stack, rootTag } = elementStack(masked, offset);
  const inBraces = insideBraces(before);

  const lastOpen = before.lastIndexOf('<');
  const lastClose = before.lastIndexOf('>');
  const insideTag = lastOpen > lastClose;

  if (!insideTag) {
    return { kind: 'text', rootTag, stack, word: partialWord(before), inBraces };
  }

  const tagText = before.slice(lastOpen);

  // `<`, `<Part`, `</`, `</Part` — an element name is being typed.
  const nameOnly = tagText.match(/^<(\/?)([A-Za-z_][\w.:-]*)?$/);
  if (nameOnly) {
    return {
      kind: nameOnly[1] ? 'closingTag' : 'elementName',
      rootTag,
      stack,
      word: nameOnly[2] ?? '',
      inBraces: false,
    };
  }

  const tagName = tagText.match(/^<([A-Za-z_][\w.:-]*)/)?.[1];

  // An odd number of quotes since the tag opened means we're inside a value.
  const quotes = (tagText.match(/"/g) || []).length;
  if (quotes % 2 === 1) {
    return {
      kind: 'attrValue',
      rootTag,
      stack,
      tagName,
      attrName: tagText.match(/([\w.:-]+)\s*=\s*"[^"]*$/)?.[1],
      word: partialWord(before),
      inBraces,
    };
  }

  return { kind: 'attrName', rootTag, stack, tagName, word: partialWord(before), inBraces: false };
}

// ---------------------------------------------------------------------------
// Catalogue lookup
// ---------------------------------------------------------------------------

/** Walks the catalogue down an open-element stack. `undefined` = uncovered. */
function resolveElement(stack: string[], rootTag: string | null): XmlElementDef | undefined {
  if (!rootTag) return undefined;
  const root = getPolicyElementTree(rootTag);
  if (!root) return undefined;
  let node: XmlElementDef | undefined = root;
  // stack[0] is the root element itself.
  for (const name of stack.slice(1)) {
    node = node.children?.find((c) => c.name === name);
    if (!node) return undefined;
  }
  return node;
}

/** Children offered under the cursor's enclosing element. */
function childrenAt(context: XmlContext): XmlElementDef[] {
  const node = resolveElement(context.stack, context.rootTag);
  if (node?.children?.length) return node.children;
  // Uncovered policy type, but the cursor is at its root: the two elements every
  // policy can carry are still safe to offer.
  if (!node && context.stack.length === 1) return FALLBACK_ROOT_CHILDREN;
  return [];
}

function attrsAt(context: XmlContext): XmlAttrDef[] {
  const { tagName, stack, rootTag } = context;
  if (!tagName) return [];
  // The tag being typed isn't on the stack yet (its `>` hasn't been written), so
  // resolve its parent and look the tag up as a child of that.
  if (tagName === rootTag && stack.length <= 1) {
    const root = getPolicyElementTree(rootTag);
    return [...UNIVERSAL_ROOT_ATTRS, ...(root?.attrs ?? [])];
  }
  const parent = resolveElement(stack, rootTag);
  return parent?.children?.find((c) => c.name === tagName)?.attrs ?? [];
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function elementSnippet(def: XmlElementDef): string {
  const attrs = (def.attrs || []).filter((a) => !a.values);
  // Only the first attribute is pre-written: `<Header name="…">` is the shape
  // people want, while pre-writing all of a five-attribute element's slots
  // leaves more to delete than to fill in.
  const attrText = attrs.length ? ` ${attrs[0].name}="$1"` : '';
  const body = attrs.length ? '$2' : '$1';

  if (def.values?.length) {
    return `${def.name}${attrText}>\${${attrs.length ? 2 : 1}|${def.values.join(',')}|}</${def.name}>$0`;
  }
  if (def.children?.length) {
    return `${def.name}${attrText}>\n\t${body}\n</${def.name}>$0`;
  }
  return `${def.name}${attrText}>${body}</${def.name}>$0`;
}

/**
 * Monaco keeps its own word-based suggestions (every identifier already in the
 * file) alongside ours. They're a useful fallback for the policy types we don't
 * cover, so they stay on — but they must never outrank a real schema element, so
 * everything from the catalogue is given a sort key that lands ahead of a bare
 * label. Harvested variables get an extra tier above the built-in ones.
 */
const SORT_HARVESTED = '0';
const SORT_CATALOG = '1';
const SORT_BUILTIN = '2';

function variableDetail(variable: FlowVariableDef): string {
  return variable.setBy ? `set by ${variable.setBy}` : variable.group;
}

export interface HoverInfo {
  /** Markdown shown in the hover. */
  markdown: string;
  /** Character offsets of the token the hover describes. */
  start: number;
  end: number;
}

/**
 * The hover for the token at `offset`, or null when we have nothing to say.
 *
 * Pure and offset-based rather than reading a Monaco model, for the same reason
 * `analyzeXmlContext` is: the interesting behaviour is which of several
 * overlapping meanings a token has — `name` is a universal root attribute *and*
 * a `<Header>` attribute, `req.tin` is a variable only inside `{…}` — and that
 * is worth checking directly rather than through a hover widget.
 */
export function hoverInfoAt(text: string, offset: number): HoverInfo | null {
  // Widen to a full dotted identifier, which is what both element names and flow
  // variables are; Monaco's own word boundaries stop at each `.`.
  let start = offset;
  while (start > 0 && /[\w.:-]/.test(text[start - 1])) start -= 1;
  let end = offset;
  while (end < text.length && /[\w.:-]/.test(text[end])) end += 1;
  const token = text.slice(start, end);
  if (!token) return null;

  const at = (markdown: string): HoverInfo => ({ markdown, start, end });
  const para = '\n\n';
  const masked = maskNonMarkup(text);
  const rootTag = firstTagOf(masked);
  const beforeToken = text.slice(0, start);

  // A variable reference wins over an element name of the same spelling.
  if (insideBraces(beforeToken) || /\bref\s*=\s*"$/.test(beforeToken)) {
    const variable = currentVariables().find((v) => v.name === token);
    if (!variable) return null;
    const origin = variable.setBy ? `Set by ${variable.setBy}.` : `_${variable.group}_`;
    return at([`**\`${token}\`**`, variable.doc, origin].join(para));
  }

  // Root element: policy-level documentation, plus a way out to the reference.
  if (rootTag && token === rootTag && beforeToken.trimEnd().endsWith('<')) {
    const meta = useStore.getState().policyTypes.find((t) => t.key === rootTag);
    const parts = [`**<${rootTag}>**`];
    if (meta?.description) parts.push(meta.description);
    if (meta?.tier === 'extensible') {
      parts.push('_Extensible policy — attaching one re-tiers every call to this proxy._');
    }
    const url = policyDocUrl(rootTag);
    if (url) parts.push(`[Apigee reference ↗](${url})`);
    return parts.length > 1 ? at(parts.join(para)) : null;
  }

  // Resolve the stack at the token's own start, not the caller's offset, so a
  // hover anywhere in a start tag is answered against that tag's parent.
  const context = analyzeXmlContext(text, start);
  const parent = resolveElement(context.stack, context.rootTag);

  // An element name: either a child of the enclosing element (hovering its start
  // tag) or the enclosing element itself (hovering its closing tag).
  const element = parent?.children?.find((c) => c.name === token);
  if (element?.doc) {
    const parts = [`**<${token}>**`, element.doc];
    if (element.repeatable) parts.push('_Repeatable._');
    return at(parts.join(para));
  }
  if (context.stack[context.stack.length - 1] === token && parent?.doc) {
    return at([`**<${token}>**`, parent.doc].join(para));
  }

  // An attribute name. Element-specific definitions win over the universal root
  // attributes, which only apply on the root element itself.
  const specific = context.tagName === token ? undefined : attrsAt(context).find((a) => a.name === token);
  const universal = context.stack.length <= 1 ? UNIVERSAL_ROOT_ATTRS.find((a) => a.name === token) : undefined;
  const attr = specific ?? universal;
  if (attr?.doc) {
    const parts = [`**${token}**`, attr.doc];
    if (attr.default) parts.push(`Defaults to \`${attr.default}\`.`);
    return at(parts.join(para));
  }

  return null;
}

function registerProviders(monaco: Monaco) {
  const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;

  monaco.languages.registerCompletionItemProvider('xml', {
    triggerCharacters: ['<', ' ', '"', '{', '.', '/'],

    provideCompletionItems(model: MonacoEditorNs.ITextModel, position: Position) {
      const context = analyzeXmlContext(model.getValue(), model.getOffsetAt(position));
      // Replace only what has been typed at the cursor. The span comes from our
      // own word pattern rather than Monaco's `getWordUntilPosition`, whose
      // default boundaries split on `.` and would leave half a variable name
      // behind when completing `request.ver` → `request.verb`.
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - context.word.length,
        endColumn: position.column,
      };

      const suggestions: languages.CompletionItem[] = [];
      const push = (item: Omit<languages.CompletionItem, 'range'> & { range: languages.CompletionItem['range'] }) =>
        suggestions.push(item as languages.CompletionItem);

      // A `{…}` reference beats every other context: inside braces the only
      // thing that can legally follow is a variable name.
      if (context.inBraces) {
        for (const variable of currentVariables()) {
          push({
            label: variable.name,
            kind: CompletionItemKind.Variable,
            detail: variableDetail(variable),
            documentation: { value: variable.doc },
            // Proxy-defined names sort above the built-ins.
            sortText: `${variable.setBy ? SORT_HARVESTED : SORT_BUILTIN}${variable.name}`,
            insertText: variable.template ? variable.name.replace(/\{([^{}]+)\}/g, (_m, p) => `\${1:${p}}`) : variable.name,
            insertTextRules: variable.template ? CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range,
          });
        }
        return { suggestions };
      }

      if (context.kind === 'closingTag') {
        const enclosing = context.stack[context.stack.length - 1];
        if (enclosing) {
          push({
            label: `${enclosing}>`,
            kind: CompletionItemKind.Snippet,
            detail: 'close this element',
            sortText: SORT_CATALOG,
            insertText: `${enclosing}>`,
            range,
          });
        }
        return { suggestions };
      }

      if (context.kind === 'elementName') {
        for (const def of childrenAt(context)) {
          push({
            label: `<${def.name}>`,
            kind: def.children?.length ? CompletionItemKind.Struct : CompletionItemKind.Field,
            detail: def.repeatable ? 'repeatable' : undefined,
            documentation: def.doc ? { value: def.doc } : undefined,
            sortText: `${SORT_CATALOG}${def.name}`,
            filterText: def.name,
            insertText: elementSnippet(def),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
        return { suggestions };
      }

      if (context.kind === 'attrName') {
        for (const attr of attrsAt(context)) {
          push({
            label: attr.name,
            kind: CompletionItemKind.Property,
            detail: attr.default ? `default "${attr.default}"` : undefined,
            documentation: attr.doc ? { value: attr.doc } : undefined,
            sortText: `${SORT_CATALOG}${attr.name}`,
            insertText: attr.values?.length
              ? `${attr.name}="\${1|${attr.values.join(',')}|}"`
              : `${attr.name}="$1"`,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
        return { suggestions };
      }

      if (context.kind === 'attrValue') {
        const attr = attrsAt(context).find((a) => a.name === context.attrName);
        for (const value of attr?.values ?? []) {
          push({ label: value, kind: CompletionItemKind.Value, sortText: `${SORT_CATALOG}${value}`, insertText: value, range });
        }
        // `ref="…"` always names a flow variable, whatever the element.
        if (!attr?.values?.length && context.attrName && /^(ref|refType)$/.test(context.attrName)) {
          for (const variable of currentVariables()) {
            if (variable.template) continue;
            push({
              label: variable.name,
              kind: CompletionItemKind.Variable,
              detail: variableDetail(variable),
              documentation: { value: variable.doc },
              sortText: variable.setBy ? `0${variable.name}` : `1${variable.name}`,
              insertText: variable.name,
              range,
            });
          }
        }
        return { suggestions };
      }

      // Text content of an element.
      const node = resolveElement(context.stack, context.rootTag);
      for (const value of node?.values ?? []) {
        push({ label: value, kind: CompletionItemKind.Value, sortText: `${SORT_CATALOG}${value}`, insertText: value, range });
      }
      if (node?.takesVariable) {
        for (const variable of currentVariables()) {
          if (variable.template) continue;
          push({
            label: variable.name,
            kind: CompletionItemKind.Variable,
            detail: variableDetail(variable),
            documentation: { value: variable.doc },
            sortText: `${variable.setBy ? SORT_HARVESTED : SORT_BUILTIN}${variable.name}`,
            insertText: variable.name,
            range,
          });
        }
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider('xml', {
    provideHover(model: MonacoEditorNs.ITextModel, position: Position) {
      const info = hoverInfoAt(model.getValue(), model.getOffsetAt(position));
      if (!info) return null;
      const from = model.getPositionAt(info.start);
      const to = model.getPositionAt(info.end);
      return {
        range: {
          startLineNumber: from.lineNumber,
          startColumn: from.column,
          endLineNumber: to.lineNumber,
          endColumn: to.column,
        },
        contents: [{ value: info.markdown }],
      };
    },
  });
}

/** Registration is global per language, so it must happen exactly once. */
let registered = false;

/**
 * `beforeMount` for every XML/policy editor: defines the theme and, the first
 * time round, registers the Apigee providers.
 */
export const setupApigeeMonaco: BeforeMount = (monaco) => {
  defineApigeeTheme(monaco);
  if (registered) return;
  registered = true;
  registerProviders(monaco);
};
