import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Order-preserving parse: children stay in document order (Step order is
// semantically meaningful to Apigee), while attributes on each node land in
// a sibling `:@` object we can sort independently. Comments are dropped by
// simply not opting into `commentPropName`.
const parseOptions = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
};

const buildOptions = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: false,
};

function sortNode(node) {
  if (Array.isArray(node)) return node.map(sortNode);
  if (node && typeof node === 'object') {
    const out = {};
    for (const key of Object.keys(node)) {
      if (key === ':@') {
        const attrs = node[key];
        const sorted = {};
        for (const attrKey of Object.keys(attrs).sort()) sorted[attrKey] = attrs[attrKey];
        out[key] = sorted;
      } else {
        out[key] = sortNode(node[key]);
      }
    }
    return out;
  }
  return node;
}

// Re-serializes XML into a deterministic form: whitespace between tags
// collapses to consistent indentation, attributes are alphabetized, and the
// XML declaration is dropped — so two documents that differ only in
// formatting compare as identical. Element order is preserved, since that's
// semantically meaningful (Step order, Flow order, ...).
export function canonicalizeXml(xml) {
  const stripped = String(xml ?? '').replace(/^\s*<\?xml[^?]*\?>\s*/, '');
  const parsed = new XMLParser(parseOptions).parse(stripped);
  const sorted = sortNode(parsed);
  return new XMLBuilder(buildOptions).build(sorted).trim();
}
