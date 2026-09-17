// Reads the generated Apigee element grammar so the server can both TEACH it to
// the model and CHECK the model against it.
//
// The grammar already exists, scraped from Google's own policy reference by
// scripts/generate-policy-schemas.mjs, but it lands in a TypeScript file on the
// client side. Rather than duplicate 4,000 lines of schema into the server (two
// copies that drift), this pulls the JSON back out of that generated file. That
// is safe to do precisely BECAUSE the file is generated: its body is written
// with JSON.stringify, so the shape is guaranteed, not hand-formatted.
//
// If the file is ever missing or restructured, element-name checking degrades to
// off rather than taking the server down with it — the model's output is still
// validated for well-formedness and for a real root tag, which are the checks
// that prevent broken XML reaching a bundle.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const GENERATED_PATH = fileURLToPath(
  new URL('../../../../client/src/lib/generated/apigeePolicyElements.ts', import.meta.url)
);

let cache = null;

function extractJsonObject(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;

  // Brace-count to the matching close. String-aware, because element
  // documentation text contains braces.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

export async function loadElementSchemas() {
  if (cache) return cache;
  try {
    const source = await readFile(GENERATED_PATH, 'utf8');
    const json = extractJsonObject(source, 'GENERATED_POLICY_ELEMENTS');
    cache = json ? JSON.parse(json) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export async function getElementTree(rootTag) {
  const schemas = await loadElementSchemas();
  return schemas[rootTag] || null;
}

// Flattens a tree into the set of element names legal anywhere inside a policy
// of this type. Position-insensitive on purpose: the scraped grammar is not
// complete enough to reject an element for being in the wrong PLACE without
// producing false failures, but it is reliable enough to reject an element that
// does not exist in the policy AT ALL — which is the actual failure mode of a
// language model writing XML.
export function collectElementNames(tree, into = new Set()) {
  if (!tree) return into;
  into.add(tree.name);
  for (const child of tree.children || []) collectElementNames(child, into);
  return into;
}

// A compact rendering of the grammar for the prompt. The full JSON tree costs
// several thousand tokens on the larger policies; this indented outline carries
// the same structure at a fraction of the size.
export function outlineTree(tree, depth = 0, lines = []) {
  if (!tree) return '';
  const indent = '  '.repeat(depth);
  const attrs = (tree.attrs || []).map((a) => a.name).join(', ');
  const values = (tree.values || []).length ? `  values: ${tree.values.join(' | ')}` : '';
  lines.push(`${indent}<${tree.name}>${attrs ? `  attrs: ${attrs}` : ''}${values}`);
  for (const child of tree.children || []) outlineTree(child, depth + 1, lines);
  return lines.join('\n');
}
