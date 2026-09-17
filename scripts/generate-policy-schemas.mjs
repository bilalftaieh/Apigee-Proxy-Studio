/**
 * Generates the policy element catalogue from the live Apigee X documentation.
 *
 *   node scripts/generate-policy-schemas.mjs          # use cached pages if present
 *   node scripts/generate-policy-schemas.mjs --fresh  # re-download everything
 *
 * Writes client/src/lib/generated/apigeePolicyElements.ts.
 *
 * Why scrape rather than consume a schema: Apigee's own policy XSDs
 * (apigee/api-platform-samples) are JAXB-generated, carry no documentation and
 * almost no enumerations, and the repo was archived in June 2025 — so they
 * describe none of the Apigee X-era policies (the AI/LLM ones, HTTPModifier,
 * DataCapture, the integration policies). The reference documentation is the
 * only source that is both current and annotated.
 *
 * The pages are unusually machine-readable, which is what makes this viable:
 * each has a canonical Syntax block using `[a|b]` for enumerations, and a
 * "Child element reference" section with one `<h3>` per element followed by its
 * description. Structure comes from the code blocks, prose from the headings.
 *
 * Everything here is best-effort and additive. A page that cannot be parsed is
 * reported and skipped, never guessed at — the app treats an absent tree as
 * "offer nothing", which is the correct failure mode for an editor.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_TYPES } from '../server/src/lib/policyTemplates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CACHE = path.join(HERE, '.docs-cache');
const OUT = path.join(ROOT, 'client/src/lib/generated/apigeePolicyElements.ts');
const BASE = 'https://cloud.google.com/apigee/docs/api-platform/reference/policies';
const INDEX_SLUG = 'reference-overview-policy';

const FRESH = process.argv.includes('--fresh');

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function page(slug) {
  const file = path.join(CACHE, `${slug}.html`);
  if (!FRESH) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      /* not cached yet */
    }
  }
  const res = await fetch(`${BASE}/${slug}`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, html);
  return html;
}

/** Every policy page linked from the reference index, as [slug, linkText]. */
function indexEntries(html) {
  const seen = new Map();
  for (const m of html.matchAll(/href="([^"]*\/reference\/policies\/[a-z0-9-]+)"[^>]*>([^<]{2,80})</g)) {
    const slug = m[1].split('/').pop();
    if (slug !== INDEX_SLUG && !seen.has(slug)) seen.set(slug, m[2].trim());
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ', apos: "'" };

function decode(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&(#?\w+);/g, (m, e) => (e in ENTITIES ? ENTITIES[e] : m));
}

/** Placeholder root tag the newer policy pages use instead of the real one. */
const GENERIC_ROOT = 'PolicyElement';

/** Offset of `<tag` in `text` where the tag name genuinely ends there, else -1. */
function findTag(text, tag, from = 0) {
  const at = text.indexOf('<' + tag, from);
  if (at === -1) return -1;
  const after = text[at + tag.length + 1];
  // Without this, `<Quota` would also match inside `<QuotaClass`.
  if (after !== undefined && !/[\s>/]/.test(after)) return findTag(text, tag, at + 1);
  return at;
}

function codeBlocks(html) {
  return [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) =>
    decode(m[1]).replace(/<!--[\s\S]*?-->/g, '')
  );
}

/**
 * The policy's root XML tag.
 *
 * Not taken from the page headings: every page also has a `<DisplayName>
 * element` heading, and on many pages it comes first, so heading order picks the
 * wrong tag. `expected` comes from the reference index's own link text
 * ("AssertCondition policy") and is authoritative; the code blocks only confirm
 * it, so a page whose blocks use the generic placeholder still resolves.
 */
function rootTagOf(html, knownTags, expected) {
  const scores = new Map();
  for (const block of codeBlocks(html)) {
    const opening = block.trim().match(/^<([A-Za-z_][\w.:-]*)[\s>/]/);
    if (!opening) continue;
    const tag = opening[1];
    if (expected && (tag === GENERIC_ROOT || tag === expected)) return expected;
    if (knownTags.has(tag)) scores.set(tag, (scores.get(tag) || 0) + 1);
  }
  let best = null;
  for (const [tag, n] of scores) if (!best || n > scores.get(best)) best = tag;
  return best ?? expected ?? null;
}

/**
 * Policy XML samples on the page: the syntax block plus every worked example.
 * Blocks written against the generic `<PolicyElement>` root count too — they are
 * the real syntax for the newer policies — and are rewritten to the real tag so
 * they merge with the rest.
 */
function xmlSamples(html, rootTag) {
  const out = [];
  for (const text of codeBlocks(html)) {
    for (const candidate of [rootTag, GENERIC_ROOT]) {
      const at = findTag(text, candidate);
      if (at === -1) continue;
      const body = text.slice(at);
      out.push(candidate === rootTag ? body : body.split(GENERIC_ROOT).join(rootTag));
      break;
    }
  }
  return out;
}

/**
 * Type words the docs use as metavariables rather than as literal values. They
 * are also, confusingly, the real allowed values of a few `type` attributes —
 * which is what the all-or-nothing rule below sorts out.
 */
const METAVARS = new Set([
  'integer', 'string', 'boolean', 'number', 'long', 'float', 'double', 'nodeset',
  'url', 'uri', 'name', 'value', 'ref', 'variable', 'expression', 'text', 'date',
]);

/**
 * `[a|b|c]` of plain tokens is an enum; prose, `{}` or spaces mean placeholder.
 *
 * The all-or-nothing metavariable rule separates a real enum from a "one of
 * these shapes" placeholder: `[string|integer|long|boolean]` is
 * ExtractVariables' actual `type` list (every alternative is a type word), while
 * `[integer|-1]` is CORS MaxAge documenting "an integer, or -1" (a type word
 * mixed with a literal). Mixed lists are dropped.
 */
function enumOf(raw) {
  const bracketed = (raw || '').trim().match(/^\[([^\]]+)\]$/);
  if (!bracketed) return undefined;
  const parts = bracketed[1].split('|').map((p) => p.trim());
  if (parts.length < 2) return undefined;
  if (!parts.every((p) => /^[A-Za-z0-9_.:-]+$/.test(p))) return undefined;
  const meta = parts.filter((p) => METAVARS.has(p.toLowerCase())).length;
  if (meta !== 0 && meta !== parts.length) return undefined;
  return parts;
}

/**
 * Tolerant tag walk over a doc sample. The samples are not well-formed XML —
 * they carry `[a|b]` placeholders and elided `...` — so a real parser is the
 * wrong tool; only the tag structure is needed, and that part is unambiguous.
 */
function parseSample(xml) {
  const tagRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g;
  const root = { name: null, children: new Map(), attrs: new Map(), text: '', count: 1 };
  const stack = [];
  let balanced = true;
  let last = 0;
  let match;

  while ((match = tagRe.exec(xml))) {
    const [full, closing, name, attrText, selfClosing] = match;
    const between = xml.slice(last, match.index);
    last = match.index + full.length;

    const current = stack[stack.length - 1];
    if (current && between.trim()) current.text += between.trim();

    if (closing) {
      const at = stack.map((n) => n.name).lastIndexOf(name);
      // A closer with no matching opener means the sample is a fragment or has
      // elided levels with `...`. Popping to whatever is left would reparent the
      // following elements onto the root, which is how `<Payload>` — a child of
      // `<Set>` — ended up looking like a direct child of `<AssignMessage>`.
      if (at === -1) balanced = false;
      else stack.length = at;
      continue;
    }

    let node;
    if (!stack.length) {
      root.name = name;
      node = root;
    } else {
      const parent = stack[stack.length - 1];
      node = parent.children.get(name);
      if (!node) {
        node = { name, children: new Map(), attrs: new Map(), text: '', count: 0 };
        parent.children.set(name, node);
      }
      // Occurrences within this one sample. Summing across samples would mark
      // everything repeatable, since the syntax block and each example all show
      // the same elements once.
      node.count += 1;
    }

    for (const a of attrText.matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)) {
      if (!node.attrs.get(a[1])) node.attrs.set(a[1], a[2]);
    }
    if (!selfClosing) stack.push(node);
  }
  if (stack.length) balanced = false;
  return { root, balanced };
}

/** Merges `from` into `into`, so several samples of one policy build one tree. */
function mergeNode(into, from) {
  for (const [name, child] of from.children) {
    const existing = into.children.get(name);
    if (!existing) {
      into.children.set(name, child);
      continue;
    }
    // Repeatability is the most any single sample showed, never the sum.
    existing.count = Math.max(existing.count || 0, child.count || 0);
    if (!existing.text && child.text) existing.text = child.text;
    for (const [a, v] of child.attrs) if (!existing.attrs.get(a)) existing.attrs.set(a, v);
    mergeNode(existing, child);
  }
}

/**
 * Element reference sections, as `{ name, parent, from, to }`.
 *
 * Headings come in two shapes. Most pages use a bare `<Payload>`; the better
 * ones qualify it — `<Payload> (child of <Copy>)` — which is worth parsing
 * because it states the nesting per occurrence rather than once per element
 * name, and `<Headers>` legitimately lives under Set, Add, Remove and Copy all
 * at once.
 */
function sectionHeadings(html) {
  const raw = [...html.matchAll(/<h[34][^>]*>([\s\S]*?)<\/h[34]>/g)];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const title = decode(raw[i][1]).replace(/\s+/g, ' ').trim();
    const hit = title.match(/^<([A-Za-z_][\w.:-]*)>(?:\s*\(child of <([A-Za-z_][\w.:-]*)>\))?$/);
    if (!hit) continue;
    const from = raw[i].index + raw[i][0].length;
    const to = i + 1 < raw.length ? raw[i + 1].index : Math.min(html.length, from + 6000);
    out.push({ name: hit[1], parent: hit[2], from, to });
  }
  return out;
}

/**
 * Per-element prose from the "Child element reference" section: each element
 * gets a heading, followed by its description.
 */
function elementDocs(html) {
  const docs = new Map();
  for (const section of sectionHeadings(html)) {
    for (const p of html.slice(section.from, section.to).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      const text = decode(p[1]).replace(/\s+/g, ' ').trim();
      if (text.length < 12 || /^(Syntax|Example)/i.test(text)) continue;
      // Keyed by parent where the heading gave one, so `<Headers>` under
      // `<Remove>` doesn't inherit the description of `<Headers>` under `<Add>`.
      if (section.parent) docs.set(`${section.parent}>${section.name}`, text);
      if (!docs.has(section.name)) docs.set(section.name, text);
      break;
    }
  }
  return docs;
}

/**
 * The parent element each reference section declares for itself.
 *
 * Every element's section carries a "Parent Element" row, and it is the only
 * unambiguous statement of nesting the pages make — the code samples elide
 * levels with `...`, which is how `<Authentication>` (documented parent
 * `<Set>`) ends up looking like a direct child of `<AssignMessage>`. Used to
 * prune misplaced elements below.
 */
function documentedParents(html) {
  const parents = new Map();
  const note = (name, parent) => {
    if (!parent || parent === name) return;
    if (!parents.has(name)) parents.set(name, new Set());
    parents.get(name).add(parent);
  };
  for (const section of sectionHeadings(html)) {
    note(section.name, section.parent);
    const text = decode(html.slice(section.from, section.to)).replace(/\s+/g, ' ');
    const stated = text.match(/Parent Element\s*<([A-Za-z_][\w.:-]*)>/);
    if (stated) note(section.name, stated[1]);
  }
  return parents;
}

/** One sentence, capped — hovers are read at a glance, not studied. */
function trimDoc(text, max = 240) {
  if (!text) return undefined;
  let out = text;
  const stop = out.search(/\.\s/);
  if (stop > 40) out = out.slice(0, stop + 1);
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}

function toDef(node, docs, depth = 0, parentName = null) {
  const def = { name: node.name };
  const doc = trimDoc(docs.get(`${parentName}>${node.name}`) ?? docs.get(node.name));
  if (doc) def.doc = doc;

  const values = enumOf(node.text);
  if (values) def.values = values;

  const attrs = [];
  for (const [name, raw] of node.attrs) {
    const attr = { name };
    const attrValues = enumOf(raw);
    if (attrValues) attr.values = attrValues;
    attrs.push(attr);
  }
  if (attrs.length) def.attrs = attrs;
  if (node.count > 1) def.repeatable = true;
  if (depth < 6 && node.children.size) {
    def.children = [...node.children.values()].map((c) => toDef(c, docs, depth + 1, node.name));
  }
  return def;
}

function extractPolicy(html, knownTags, expected, pruned = []) {
  const rootTag = rootTagOf(html, knownTags, expected);
  if (!rootTag) return null;
  const samples = xmlSamples(html, rootTag);
  const docs = elementDocs(html);

  // Only samples that open and close cleanly contribute structure. The pages
  // are full of deliberate fragments (one element in isolation, bodies elided
  // with `...`), and folding those in produces elements at the wrong depth —
  // which in an editor means suggesting `<Payload>` directly inside
  // `<AssignMessage>`, where it is not valid.
  const parsed = samples.map(parseSample).filter((p) => p.balanced && p.root.name === rootTag);

  // Whatever the canonical Syntax block shows directly under the root is a
  // direct child, full stop — recorded here, before any merging, because
  // mergeNode mutates its target in place and would otherwise backfill this set
  // with every element found anywhere on the page.
  //
  // The syntax block is identified as the richest balanced sample rather than
  // the first: pages open with a short worked example often enough that
  // position is unreliable, and a one-element example would otherwise get to
  // define the whole root shape.
  const canonical = parsed.reduce(
    (best, p) => (!best || p.root.children.size > best.root.children.size ? p : best),
    null
  );
  const syntaxChildren = new Set(canonical ? canonical.root.children.keys() : []);

  const merged = parsed.length
    ? parsed[0].root
    : { name: rootTag, children: new Map(), attrs: new Map(), text: '', count: 1 };
  for (const { root } of parsed.slice(1)) mergeNode(merged, root);

  // Some pages (PythonScript) only ever show per-element fragments, never a
  // whole policy. There the "Child element reference" headings are the element
  // inventory. Used only when the samples yielded nothing, because those
  // headings also cover nested elements, which would otherwise be hoisted to
  // the root.
  if (!merged.children.size) {
    for (const name of docs.keys()) {
      merged.children.set(name, { name, children: new Map(), attrs: new Map(), text: '', count: 1 });
    }
  }
  if (!merged.children.size) return null;

  // Prune root children the docs place elsewhere. Applied only at depth 1: an
  // element name can legitimately nest under several parents deeper in a tree
  // (`<Headers>` lives under Set, Add, Remove and Copy alike) and each name gets
  // just one reference section, so the stated parent is only a safe test for
  // "is this really a direct child of the policy?".
  // An element the syntax block puts at the root stays, even when it is also
  // documented under a nested parent: `<Allow>` sits directly under `<Quota>`
  // and again under `<Quota><Class>`, and only the second gets a qualified
  // heading.
  const parents = documentedParents(html);
  for (const name of [...merged.children.keys()]) {
    if (syntaxChildren.has(name)) continue;
    const stated = parents.get(name);
    if (!stated) continue;
    // GENERIC_ROOT in a "Parent Element" row means the policy root itself.
    if (stated.has(rootTag) || stated.has(GENERIC_ROOT)) continue;
    merged.children.delete(name);
    pruned.push(rootTag + ': <' + name + '> belongs under <' + [...stated].join('>, <') + '>');
  }

  merged.name = rootTag;
  const def = toDef(merged, docs);
  // Root attributes and root text are universal, and the app owns them.
  delete def.attrs;
  delete def.values;
  delete def.repeatable;
  return { rootTag, def };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  const knownTags = new Set(POLICY_TYPES.map((p) => p.xmlTag || p.key));
  const byNormalized = new Map([...knownTags].map((t) => [normalize(t), t]));

  const entries = indexEntries(await page(INDEX_SLUG));
  console.log(`Reference index lists ${entries.length} policy pages.`);

  const trees = new Map();
  const slugFor = new Map();
  const skipped = [];
  const pruned = [];

  for (const [slug, title] of entries) {
    let html;
    try {
      html = await page(slug);
    } catch (err) {
      skipped.push(`${slug} (${err.message})`);
      continue;
    }
    const expected = byNormalized.get(normalize(title.replace(/policy$/i, '')));
    const result = extractPolicy(html, knownTags, expected, pruned);
    if (!result) {
      skipped.push(`${slug} (no policy XML found)`);
      continue;
    }
    if (!knownTags.has(result.rootTag)) {
      skipped.push(`${slug} (root <${result.rootTag}> is not a policy type this app offers)`);
      continue;
    }
    if (!trees.has(result.rootTag)) {
      trees.set(result.rootTag, result.def);
      slugFor.set(result.rootTag, slug);
    }
  }

  const missing = [...knownTags].filter((t) => !trees.has(t)).sort();
  const count = (def) => 1 + (def.children || []).reduce((a, c) => a + count(c), 0);
  const docCount = (def) => (def.doc ? 1 : 0) + (def.children || []).reduce((a, c) => a + docCount(c), 0);
  const elements = [...trees.values()].reduce((a, d) => a + count(d) - 1, 0);
  const documented = [...trees.values()].reduce((a, d) => a + docCount(d), 0);

  console.log(`Extracted ${trees.size}/${knownTags.size} policy tags, ${elements} elements, ${documented} documented.`);
  if (pruned.length) {
    console.log(`Pruned ${pruned.length} misplaced root elements:`);
    for (const note of pruned) console.log(`  ${note}`);
  }
  if (skipped.length) console.log(`Skipped ${skipped.length}:\n  ${skipped.join('\n  ')}`);
  if (missing.length) console.log(`No tree for: ${missing.join(', ')}`);

  const sortedTrees = [...trees.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sortedSlugs = [...slugFor.entries()].sort(([a], [b]) => a.localeCompare(b));

  const body = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced by scripts/generate-policy-schemas.mjs from the Apigee X policy
// reference at ${BASE}.
// Re-run \`npm run generate:policy-schemas\` to refresh.
//
// ${trees.size} of ${knownTags.size} policy root tags, ${elements} elements, ${documented} with documentation.
${missing.length ? `// Not covered here: ${missing.join(', ')}.\n` : ''}
import type { XmlElementDef } from '../policyXmlSchema';

export const GENERATED_POLICY_ELEMENTS: Record<string, XmlElementDef> = ${JSON.stringify(
    Object.fromEntries(sortedTrees),
    null,
    2
  )};

/** Documentation page slug per policy tag, taken from the reference index. */
export const GENERATED_DOC_SLUGS: Record<string, string> = ${JSON.stringify(
    Object.fromEntries(sortedSlugs),
    null,
    2
  )};
`;

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, body);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(body.length / 1024).toFixed(0)} KB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
