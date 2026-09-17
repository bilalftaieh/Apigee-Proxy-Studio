// Builds what we ask the model for, and turns what comes back into XML.
//
// The model is never asked to write XML. It fills in a structured object whose
// shape we define, and this file renders that object into XML with the same
// escaping helpers the rest of the bundle generator uses. That split is the
// whole trick: syntax correctness becomes our responsibility (and we are
// deterministic about it), leaving the model responsible only for the decisions
// it is actually good at — which elements, and what values.

import { escapeXml, escapeXmlText, XML_HEADER } from '../xml.js';
import { outlineTree } from './elementSchema.js';

// Apigee policies nest shallowly. Four levels covers everything in the scraped
// grammar with room to spare; the schema has to be finite because Gemini's
// response schemas cannot express recursion.
const MAX_ELEMENT_DEPTH = 4;

const ATTRIBUTE_SCHEMA = {
  type: 'ARRAY',
  description: 'XML attributes on this element.',
  items: {
    type: 'OBJECT',
    properties: { name: { type: 'STRING' }, value: { type: 'STRING' } },
    required: ['name', 'value'],
  },
};

function elementSchema(depth) {
  const properties = {
    name: { type: 'STRING', description: 'Element name, exactly as spelled in the grammar.' },
    text: { type: 'STRING', description: 'Text content. Omit if this element has children.' },
    attributes: ATTRIBUTE_SCHEMA,
  };
  if (depth < MAX_ELEMENT_DEPTH) {
    properties.children = { type: 'ARRAY', items: elementSchema(depth + 1) };
  }
  return { type: 'OBJECT', properties, required: ['name'] };
}

const DEFAULT_NOTES_DESCRIPTION =
  'One or two sentences for the user: what this policy does, and anything they still ' +
  'need to fill in themselves. Plain language, no markdown.';

/**
 * The shape of a policy body, as the model fills it in.
 *
 * Shared by both AI features so that a fix is decoded against the same schema a
 * generation is, and can therefore be rendered and validated by the same code.
 *
 * @param {boolean} chooseType Ask the model which policy type to use.
 * @param {boolean} includeName Ask it to name the policy. The fix path says no:
 *   the name is already decided and is referenced by Steps elsewhere in the
 *   proxy, so it is not the model's to change.
 * @param {string} notesDescription What `notes` should contain — the one field
 *   whose job genuinely differs between describing a new policy and describing
 *   an edit to an existing one.
 */
export function buildResponseSchema({
  chooseType = false,
  includeName = true,
  notesDescription = DEFAULT_NOTES_DESCRIPTION,
} = {}) {
  const properties = {
    displayName: { type: 'STRING', description: 'Human-readable name for the Apigee UI.' },
    rootAttributes: ATTRIBUTE_SCHEMA,
    elements: {
      type: 'ARRAY',
      description: 'Child elements of the policy root, in document order.',
      items: elementSchema(1),
    },
    notes: { type: 'STRING', description: notesDescription },
  };
  const required = ['elements', 'notes'];

  if (includeName) {
    properties.policyName = {
      type: 'STRING',
      description:
        'Apigee policy name: letters, digits, dot, dash, underscore only. Use the conventional ' +
        'prefix for the type (AM- for AssignMessage, RC- for ResponseCache, SA- for SpikeArrest, etc.).',
    };
    required.unshift('policyName');
  }

  if (chooseType) {
    properties.policyType = {
      type: 'STRING',
      description: 'The key of the policy type that best fits the request.',
    };
    required.unshift('policyType');
  }

  return { type: 'OBJECT', properties, required, propertyOrdering: required };
}

export const SYSTEM_INSTRUCTION = [
  'You configure Apigee X API proxy policies.',
  '',
  'Rules:',
  '- Use ONLY element and attribute names that appear in the grammar you are given.',
  '  If the grammar does not contain an element, it does not exist — do not invent one.',
  '- Prefer the documented Apigee flow variables you are given over inventing variable names.',
  '- Values that look like {{URL_1}}, {{KVM_1}} or {{TARGETSERVER_1}} are placeholders for real',
  '  values that were withheld. Treat each as an opaque literal: reuse it exactly as written',
  '  wherever it belongs. Never guess what it stands for, and never invent new placeholders.',
  '- Leave out optional elements the user did not ask for. A small correct policy beats a',
  '  large speculative one.',
  '- If the request is ambiguous, choose the most conventional Apigee configuration and say',
  '  what you assumed in notes.',
].join('\n');

/**
 * @returns {{ text: string, staticText: string }} `staticText` is the part of
 *   the prompt built entirely from this repo's own constants — the scraped
 *   grammar, the static template catalogue, the documented flow-variable list.
 *   The leak guard subtracts it before hunting for sensitive literals, which is
 *   how it tells "a hostname survived redaction" apart from "an Apigee element
 *   happens to be spelled like your TargetServer".
 */
export function buildPolicyPrompt({ context, elementTree, catalogue }) {
  const parts = [];

  // The one line here carrying anything the user or their workspace supplied.
  // It stays first so that everything after it is contiguous, which is what
  // lets `staticText` below be a single substring of `text` rather than a list
  // of fragments the guard would have to stitch back together.
  parts.push(`Request: ${context.intent}`);
  parts.push('');

  if (catalogue) {
    parts.push('Choose the single best policy type for this request from:');
    for (const t of catalogue) {
      parts.push(`- ${t.key} (${t.category}): ${t.description}`);
    }
    parts.push('');
  } else {
    parts.push(`Policy type: ${context.policyType} — ${context.policyLabel} (${context.policyCategory})`);
    parts.push(`Root element: <${context.policyRootTag}>`);
    parts.push('');
  }

  if (elementTree) {
    parts.push(`Grammar for <${context.policyRootTag}> (indentation shows nesting):`);
    parts.push(outlineTree(elementTree));
    parts.push('');
  }

  if (context.template) {
    parts.push('The blank template for this policy type, for reference:');
    parts.push(context.template.trim());
    parts.push('');
  }

  parts.push('Flow variables available in this proxy:');
  parts.push(context.commonFlowVariables.join(', '));

  return { text: parts.join('\n'), staticText: parts.slice(1).join('\n') };
}

// A legal XML name. The model is decoding against a schema that tells it to
// spell elements exactly as the grammar does, but nothing in the decoder
// enforces that the string it produces is a usable name — and unlike text and
// attribute VALUES, which escapeXml handles, a NAME is interpolated raw into
// tag position. `<Assign Message>` is not a document any parser should accept.
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function named(node) {
  return Boolean(node?.name) && XML_NAME.test(node.name);
}

/**
 * Every element or attribute name in the model's answer that could not be
 * written as XML. Rendering drops them so the output is well-formed whatever
 * the model did; this is what lets the caller say so out loud instead of
 * silently handing back a policy with a piece missing.
 */
export function invalidXmlNames(result) {
  const bad = new Set();

  const visitAttributes = (attributes) => {
    for (const attr of attributes || []) {
      if (attr?.name && !XML_NAME.test(attr.name)) bad.add(attr.name);
    }
  };

  const visit = (element) => {
    if (!element?.name) return;
    if (!XML_NAME.test(element.name)) bad.add(element.name);
    visitAttributes(element.attributes);
    for (const child of element.children || []) visit(child);
  };

  visitAttributes(result?.rootAttributes);
  for (const element of result?.elements || []) visit(element);

  return [...bad];
}

function renderAttributes(attributes) {
  return (attributes || [])
    .filter(named)
    .map((a) => ` ${a.name}="${escapeXml(a.value)}"`)
    .join('');
}

function renderElement(element, depth) {
  if (!named(element)) return '';
  const indent = '    '.repeat(depth);
  const attrs = renderAttributes(element.attributes);
  const children = (element.children || []).filter(named);

  if (children.length) {
    const inner = children.map((c) => renderElement(c, depth + 1)).join('\n');
    return `${indent}<${element.name}${attrs}>\n${inner}\n${indent}</${element.name}>`;
  }
  // An element with neither text nor children is a legitimate Apigee flag
  // (<SkipCacheLookup/>), so it self-closes rather than being dropped.
  if (element.text === undefined || element.text === null || element.text === '') {
    return `${indent}<${element.name}${attrs}/>`;
  }
  return `${indent}<${element.name}${attrs}>${escapeXmlText(element.text)}</${element.name}>`;
}

// Renders the model's object into policy XML. Matches the string-templating
// style and two-space/four-space indentation of the existing templates in
// policyTemplates.js so generated policies are indistinguishable from
// hand-added ones once accepted.
export function renderPolicyXml(result, rootTag) {
  // The root `name` attribute is written from result.policyName below, so drop a
  // duplicate if the model also volunteered one in rootAttributes.
  const attrs = renderAttributes(result.rootAttributes).replace(/ name="[^"]*"/, '');

  const displayName = result.displayName
    ? `    <DisplayName>${escapeXmlText(result.displayName)}</DisplayName>\n`
    : '';

  const body = (result.elements || [])
    // Same reason: DisplayName is emitted from result.displayName, and the model
    // often supplies it in both places.
    .filter((e) => named(e) && !(displayName && e.name === 'DisplayName'))
    .map((e) => renderElement(e, 1))
    .join('\n');

  return (
    `${XML_HEADER}<${rootTag} name="${escapeXml(result.policyName)}"${attrs}>\n` +
    displayName +
    (body ? `${body}\n` : '') +
    `</${rootTag}>\n`
  );
}
