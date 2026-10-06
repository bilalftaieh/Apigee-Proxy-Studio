/**
 * Generates the policy element catalogue from the live Apigee X documentation.
 *
 *   node scripts/generate-policy-schemas.mjs          # use cached pages if present
 *   node scripts/generate-policy-schemas.mjs --fresh  # re-download everything
 *   node scripts/generate-policy-schemas.mjs --check  # has the reference moved?
 *
 * Writes client/src/lib/generated/apigeePolicyElements.ts.
 *
 * `--check` re-downloads, regenerates, and compares against the committed file
 * without writing it, exiting non-zero when they differ. It needs the network
 * and depends on pages outside this repo, so it is a thing you run when you
 * want to know, never part of the test suite — a build that fails because
 * Google reworded a sentence is a build nobody trusts. The standing, offline
 * check on this file is scripts/test-policy-schemas.mjs.
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
// docs.cloud.google.com, not cloud.google.com: the latter 301s here, and while
// fetch follows that, the redirect is not something to depend on. `hl=en` is
// not optional — the site negotiates language, and an untagged request can
// return a localized page, which would put translated prose into a generated
// file that every developer on the project shares.
const BASE = 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies';
const LANG = 'hl=en';
const INDEX_SLUG = 'reference-overview-policy';

const CHECK = process.argv.includes('--check');
// --check is only meaningful against freshly downloaded pages.
const FRESH = process.argv.includes('--fresh') || CHECK;

/**
 * The one line of the output that changes on every run.
 *
 * Everything else the generator emits is deterministic — the same pages in
 * produce byte-identical output — which is what lets --check compare by diff.
 * The stamp would defeat that, so it is written in a form both sides can strip.
 */
const STAMP = /^\/\/ Generated .*$/m;

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
  const res = await fetch(`${BASE}/${slug}?${LANG}`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, html);
  return html;
}

/**
 * Every policy page linked from the reference index, as [slug, linkText].
 *
 * The link text is read by stripping tags rather than by matching the text
 * directly, because the index writes it two ways: the older pages put it
 * straight in the anchor ("Quota policy"), the current ones wrap it in a nav
 * span ("<span class=...>Quota</span>"). Only the first shape was matched
 * before, so against the current index this returned nothing at all and the
 * generator had no pages to visit.
 *
 * Both spellings resolve to the same policy, since the caller normalizes the
 * text and strips a trailing "policy" before matching it to a root tag.
 */
function indexEntries(html) {
  const seen = new Map();
  for (const m of html.matchAll(/href="([^"]*\/reference\/policies\/[a-z0-9-]+)"([\s\S]*?)<\/a>/g)) {
    const slug = m[1].split('/').pop();
    if (slug === INDEX_SLUG || seen.has(slug)) continue;
    // Drop the rest of the opening tag, then any markup wrapping the label.
    const text = decode(m[2].replace(/^[^>]*>/, '')).replace(/\s+/g, ' ').trim();
    if (text.length >= 2 && text.length <= 80) seen.set(slug, text);
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

/** Attributes every policy root carries; the editor renders these itself. */
const COMMON_POLICY_ATTRS = new Set(['name', 'enabled', 'continueOnError', 'async']);

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
  // h2 matters as much as h3: the reference puts each top-level element at h2
  // and only qualified ones ("<Allow> (child of <Class>)") at h3, so matching
  // h3/h4 alone saw a policy's nested elements and none of its main ones.
  const raw = [...html.matchAll(/<h([234])[^>]*>([\s\S]*?)<\/h\1>/g)];
  const out = [];
  // The last h2 element heading seen, which an h3 element heading nests under
  // on the pages that state no parent of their own.
  let lastTopLevel = null;
  for (let i = 0; i < raw.length; i++) {
    const level = Number(raw[i][1]);
    // decode() strips the <code> wrappers these headings are built from.
    const title = decode(raw[i][2]).replace(/\s+/g, ' ').trim();
    // Some pages suffix the element name ("<Timeout> element"), some don't.
    const hit = title.match(/^<([A-Za-z_][\w.:-]*)>(?:\s*\(child of <([A-Za-z_][\w.:-]*)>\))?(?:\s+element)?$/);
    if (!hit) {
      // A non-element h2 ("Flow variables", "Error reference") ends the run of
      // element sections it was heading, so an h3 below it is not an element's
      // child section.
      if (level === 2) lastTopLevel = null;
      continue;
    }
    const from = raw[i].index + raw[i][0].length;
    const to = i + 1 < raw.length ? raw[i + 1].index : Math.min(html.length, from + 6000);
    if (level === 2) lastTopLevel = hit[1];
    out.push({ name: hit[1], parent: hit[2], from, to, level, under: level > 2 ? lastTopLevel : null });
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
 * The reference tables, which say what the prose and the samples cannot.
 *
 * Two shapes carry this, both scoped to the element's own `<h3>`:
 *
 *   A. `Attribute | Description | Default | Presence` — one row per attribute.
 *   B. a two-column property table whose rows are labelled `Default`,
 *      `Presence`, `Type` and `Valid values` — facts about the element itself.
 *
 * Reading them is what turns a free-text box into a dropdown with a default and
 * a required marker. Everything below is deliberately conservative: a cell that
 * does not parse as a value is dropped rather than guessed at, because a wrong
 * enum in an editor is worse than no enum — it hides the valid option.
 */

/** Rows of each `<table>` in `html`, as cells carrying both markup and text. */
function tableRows(html) {
  const tables = [];
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => ({
        raw: c[1],
        text: decode(c[1]).replace(/\s+/g, ' ').trim(),
      }))
    );
    if (rows.length) tables.push(rows);
  }
  return tables;
}

/** The docs' spellings of "this element has no default". */
const NO_DEFAULT = /^(n\/?a|none|not applicable|no default|empty)\b/i;

/**
 * A stated default, when it is a value rather than a description of one.
 *
 * "false" is a default the editor can prefill; "0 seconds (no grace period)" is
 * prose that happens to start with a number, and prefilling it would write
 * nonsense into the XML.
 */
function defaultOf(cell) {
  const text = (cell || '').trim();
  if (!text || NO_DEFAULT.test(text)) return undefined;
  return /^[A-Za-z0-9_.:\/-]+$/.test(text) ? text : undefined;
}

/**
 * `true` only where presence is stated flatly as Required.
 *
 * The conditional spellings ("Required for HMAC algorithms", "Required, when
 * verifying an encrypted JWT") are real, but they are requirements on a
 * configuration the generator cannot see, so flagging them unconditionally
 * would mark valid policies invalid.
 */
function requiredOf(cell) {
  return /^required$/i.test((cell || '').trim()) ? true : undefined;
}

/**
 * A comma- or "or"-separated run of plain tokens is an enum; a sentence is not.
 *
 * This is what separates "HS256, HS384, HS512, …" and "true or false" from
 * "Either a message template, or a reference to a variable containing the
 * payload", which splits into tokens that are plainly prose.
 */
function tokenList(text) {
  const trimmed = (text || '').trim().replace(/\.$/, '');
  if (!trimmed || trimmed.length > 200) return undefined;
  const parts = trimmed.split(/\s*,\s*|\s+or\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return undefined;
  if (!parts.every((p) => /^[A-Za-z0-9_.:-]+$/.test(p))) return undefined;
  return [...new Set(parts)];
}

/** `<li><code>calendar</code></li>` runs — the docs' other way of writing an enum. */
function listedCodes(raw) {
  const items = [...raw.matchAll(/<li[^>]*>\s*<code[^>]*>([^<]+)<\/code>\s*<\/li>/g)].map((m) =>
    decode(m[1]).trim()
  );
  if (items.length < 2) return undefined;
  if (!items.every((v) => /^[A-Za-z0-9_.:-]+$/.test(v))) return undefined;
  return [...new Set(items)];
}

/** Allowed values stated in a cell that is wholly about values. */
function valuesOf(cell) {
  return listedCodes(cell.raw) ?? tokenList(cell.text);
}

/**
 * Allowed values buried in a description cell, which needs the docs' own cue
 * before a list in it can be read as the attribute's values — an attribute
 * description may list anything.
 */
function valuesInDescription(cell) {
  if (!/valid values|must be one of|one of the following/i.test(cell.text)) return undefined;
  return listedCodes(cell.raw);
}

/** Per-attribute facts from each element's "Attribute | Description | …" table. */
function documentedAttrs(html) {
  const attrs = new Map();

  for (const section of sectionHeadings(html)) {
    const found = [];
    for (const rows of tableRows(html.slice(section.from, section.to))) {
      const header = rows[0].map((c) => c.text.toLowerCase());
      if (!/^attributes?$/.test(header[0] || '')) continue;
      const col = (label) => header.indexOf(label);
      const iDoc = col('description');
      const iDefault = col('default');
      const iPresence = col('presence');

      for (const cells of rows.slice(1)) {
        const name = (cells[0]?.text || '').replace(/\s*\(deprecated\)$/i, '').trim();
        if (!/^[A-Za-z_][\w.:-]*$/.test(name)) continue;
        const attr = { name };
        if (iDoc > 0 && cells[iDoc]) {
          const doc = trimDoc(cells[iDoc].text);
          if (doc) attr.doc = doc;
          const values = valuesInDescription(cells[iDoc]);
          if (values) attr.values = values;
        }
        if (iDefault > 0 && cells[iDefault]) {
          const value = defaultOf(cells[iDefault].text);
          if (value) attr.default = value;
        }
        if (iPresence > 0 && cells[iPresence]) {
          const required = requiredOf(cells[iPresence].text);
          if (required) attr.required = true;
        }
        found.push(attr);
      }
    }
    if (!found.length) continue;
    if (section.parent) attrs.set(`${section.parent}>${section.name}`, found);
    if (!attrs.has(section.name)) attrs.set(section.name, found);
  }
  return attrs;
}

/**
 * Which fact a property-table row states, across the spellings the pages use.
 *
 * The same row is written `Presence`, `Presence:` and `Required?` depending on
 * the page's vintage, and the default as `Default`, `Default:` or
 * `Default Value` — between them that is more rows than the spellings this
 * started out matching, which is why so much of the table went unread.
 */
function factLabel(text) {
  const label = (text || '').trim().toLowerCase().replace(/[?:]+$/, '').trim();
  if (label === 'default' || label === 'default value') return 'default';
  if (label === 'presence' || label === 'required') return 'required';
  if (label === 'valid values' || label === 'allowed values') return 'values';
  if (label === 'type') return 'type';
  return undefined;
}

/** Default, presence and allowed values for the element itself, from its property table. */
function elementFacts(html) {
  const facts = new Map();

  for (const section of sectionHeadings(html)) {
    const found = {};
    for (const rows of tableRows(html.slice(section.from, section.to))) {
      // Shape B has no header row — every row is `label | value`.
      if (rows[0].length !== 2) continue;
      for (const [label, value] of rows) {
        if (!label || !value) continue;
        switch (factLabel(label.text)) {
          case 'default': {
            const stated = defaultOf(value.text);
            if (stated && found.default === undefined) found.default = stated;
            break;
          }
          case 'required': {
            if (requiredOf(value.text) && found.required === undefined) found.required = true;
            break;
          }
          case 'values': {
            const stated = valuesOf(value);
            if (stated && !found.values) found.values = stated;
            break;
          }
          case 'type': {
            // The only type the docs name that is also an enumeration. The rest
            // ("String", "Complex type", "Array of <Header> elements") describe
            // a shape, which the tree already carries.
            if (/^boolean$/i.test(value.text) && !found.values) found.values = ['true', 'false'];
            break;
          }
          default:
            break;
        }
      }
    }
    if (!Object.keys(found).length) continue;
    if (section.parent) facts.set(`${section.parent}>${section.name}`, found);
    if (!facts.has(section.name)) facts.set(section.name, found);
  }
  return facts;
}

/**
 * The parent element each reference section declares for itself./**
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

/**
 * Every node in `tree` carrying `name`, deepest last.
 *
 * An element name can legitimately appear at several places in one policy
 * (`<Headers>` under Set, Add, Remove and Copy), so a documented child is
 * attached to every occurrence of its stated parent rather than just the first.
 */
function nodesNamed(tree, name, found = []) {
  for (const child of tree.children.values()) {
    if (child.name === name) found.push(child);
    nodesNamed(child, name, found);
  }
  return found;
}

/**
 * Adds elements that the "Child element reference" documents but no sample on
 * the page happens to show in a balanced block.
 *
 * This is the difference between a catalogue that describes the policy and one
 * that describes the examples. Quota's <UseQuotaConfigInAPIProduct>,
 * <Synchronous> and <AsynchronousConfiguration> are all documented with a
 * "Parent Element <Quota>" row, and all three were missing, because the page
 * only ever shows them in fragments elided with `...` — which parseSample
 * rightly refuses to trust for structure. The stated parent, though, is an
 * unambiguous claim about nesting, so it is safe to place an element by it.
 *
 * Runs to a fixpoint: an element added in one pass can be the documented parent
 * of another, and the reference lists them in no particular order.
 */
function addDocumentedElements(merged, html, rootTag, added = []) {
  const parents = documentedParents(html);

  // Where a page states no parent at all (OAuthV2 and VerifyJWT are written
  // this way), fall back to the layout of the reference itself, which is how a
  // reader resolves it: an element with its own h2 is a direct child of the
  // policy, and an h3 belongs to the h2 above it. Headings that name a path
  // ("<PrivateKey>/<Value>") don't match the element pattern at all and are
  // skipped, so this never has to guess at a nesting the page only implies.
  const placements = new Map();
  for (const section of sectionHeadings(html)) {
    const stated = parents.get(section.name);
    const where = stated ? [...stated] : [section.under ?? rootTag];
    placements.set(section.name, where);
  }

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const [name, where] of placements) {
      if (name === rootTag || name === 'DisplayName') continue;
      for (const parentName of where) {
        const hosts =
          parentName === rootTag || parentName === GENERIC_ROOT ? [merged] : nodesNamed(merged, parentName);
        for (const host of hosts) {
          if (host.children.has(name)) continue;
          host.children.set(name, { name, children: new Map(), attrs: new Map(), text: '', count: 1 });
          added.push(`${rootTag}: <${name}> under <${host.name}>`);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
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

function toDef(node, ref, depth = 0, parentName = null) {
  const { docs, attrDocs, facts } = ref;
  // Qualified by parent where the page qualifies its heading, so `<Headers>`
  // under `<Remove>` doesn't inherit what `<Add>` documents.
  const lookup = (map) => map.get(`${parentName}>${node.name}`) ?? map.get(node.name);

  const def = { name: node.name };
  const doc = trimDoc(lookup(docs));
  if (doc) def.doc = doc;

  // The sample's own `[a|b]` placeholder first: it is the canonical syntax
  // block's statement about this exact position in the tree, where the property
  // table describes the element wherever it appears.
  const fact = lookup(facts) || {};
  const values = enumOf(node.text) ?? fact.values;
  if (values) def.values = values;
  if (fact.default !== undefined) def.default = fact.default;
  if (fact.required) def.required = true;

  // Attributes come from two places that each miss what the other sees: the
  // samples show what is actually used, the table documents what is accepted
  // (<Payload>'s contentType among them, which no sample happens to set).
  const attrs = new Map();
  for (const [name, raw] of node.attrs) {
    const attr = { name };
    const attrValues = enumOf(raw);
    if (attrValues) attr.values = attrValues;
    attrs.set(name, attr);
  }
  for (const documented of lookup(attrDocs) || []) {
    const attr = attrs.get(documented.name) || { name: documented.name };
    // A sampled `[a|b]` enum is the narrower claim; keep it over the table's.
    if (documented.doc && !attr.doc) attr.doc = documented.doc;
    if (documented.values && !attr.values) attr.values = documented.values;
    if (documented.default !== undefined && attr.default === undefined) attr.default = documented.default;
    if (documented.required && !attr.required) attr.required = true;
    attrs.set(attr.name, attr);
  }
  if (attrs.size) def.attrs = [...attrs.values()];
  if (node.count > 1) def.repeatable = true;
  if (depth < 6 && node.children.size) {
    def.children = [...node.children.values()].map((c) => toDef(c, ref, depth + 1, node.name));
  }
  return def;
}

function extractPolicy(html, knownTags, expected, pruned = [], added = []) {
  const rootTag = rootTagOf(html, knownTags, expected);
  if (!rootTag) return null;
  const samples = xmlSamples(html, rootTag);
  const docs = elementDocs(html);
  const ref = { docs, attrDocs: documentedAttrs(html), facts: elementFacts(html) };

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
  // The samples describe the examples; the reference describes the policy.
  // Fold in whatever the reference documents that no balanced sample showed.
  addDocumentedElements(merged, html, rootTag, added);

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
  const def = toDef(merged, ref);
  // The four attributes every policy shares are the app's to render; a
  // policy-specific one (Quota's `type`, KeyValueMapOperations' `mapIdentifier`)
  // is part of the policy's own shape and has to survive.
  def.attrs = (def.attrs || []).filter((a) => !COMMON_POLICY_ATTRS.has(a.name));
  if (!def.attrs.length) delete def.attrs;
  delete def.values;
  delete def.repeatable;
  // A policy root is always "required" and has no default; both rows exist on
  // the page, and both are noise once the policy is attached.
  delete def.default;
  delete def.required;
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
  const added = [];

  for (const [slug, title] of entries) {
    let html;
    try {
      html = await page(slug);
    } catch (err) {
      skipped.push(`${slug} (${err.message})`);
      continue;
    }
    const expected = byNormalized.get(normalize(title.replace(/policy$/i, '')));
    const result = extractPolicy(html, knownTags, expected, pruned, added);
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

  // Counted so the header records them: these come from the reference tables,
  // which are the part of the page most likely to be restructured upstream, and
  // a silent drop to zero is exactly the regression that is easy to miss.
  const tally = (def, seen = { values: 0, required: 0, defaults: 0 }) => {
    if (def.values) seen.values++;
    if (def.required) seen.required++;
    if (def.default !== undefined) seen.defaults++;
    for (const attr of def.attrs || []) {
      if (attr.values) seen.values++;
      if (attr.required) seen.required++;
      if (attr.default !== undefined) seen.defaults++;
    }
    for (const child of def.children || []) tally(child, seen);
    return seen;
  };
  const facts = [...trees.values()].reduce((a, d) => {
    const s = tally(d);
    return { values: a.values + s.values, required: a.required + s.required, defaults: a.defaults + s.defaults };
  }, { values: 0, required: 0, defaults: 0 });

  console.log(`Extracted ${trees.size}/${knownTags.size} policy tags, ${elements} elements, ${documented} documented.`);
  console.log(`Facts: ${facts.values} enumerated, ${facts.required} required, ${facts.defaults} with defaults.`);
  if (added.length) console.log(`Added ${added.length} elements documented but absent from every sample.`);
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
// Generated ${new Date().toISOString().slice(0, 10)}.
//
// That date is the only way to tell how far this has drifted from the
// reference, because the page cache it was built from is not in git.
// \`npm run check:policy-schemas\` says whether the reference has moved since.
//
// ${trees.size} of ${knownTags.size} policy root tags, ${elements} elements, ${documented} with documentation.
// ${facts.values} enumerated, ${facts.required} required, ${facts.defaults} with a default.
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

  if (CHECK) {
    // Compared with the stamp stripped from both sides, so the answer is about
    // the reference documentation and not about what today's date is.
    const strip = (text) => text.replace(STAMP, '').trim();
    let committed;
    try {
      committed = await fs.readFile(OUT, 'utf8');
    } catch {
      console.error(`No committed catalogue at ${path.relative(ROOT, OUT)} — run the generator.`);
      process.exit(1);
    }
    if (strip(committed) === strip(body)) {
      console.log('Up to date: the reference produces exactly the committed catalogue.');
      return;
    }
    console.error(
      `Out of date: ${path.relative(ROOT, OUT)} no longer matches the reference.
` +
        'Run `npm run generate:policy-schemas -- --fresh` and review the diff.'
    );
    process.exit(1);
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, body);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(body.length / 1024).toFixed(0)} KB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
