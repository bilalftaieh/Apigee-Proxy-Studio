/**
 * Guards the committed policy catalogue against collapse.
 *
 * The catalogue is scraped from documentation this repo does not control, by a
 * parser that depends on the shape of those pages. When that shape changes the
 * parser does not throw — it quietly finds less, or nothing at all. That has
 * already happened once: a reworked index page left the slug regex matching
 * zero links, and a --fresh run would have written an empty catalogue without
 * a single error.
 *
 * So this asserts floors, never exact counts. Upstream edits move the totals by
 * one or two whenever a sentence is reworded, and a test that fails on that is
 * a test people learn to ignore. A floor says nothing about normal drift and
 * everything about a parser that has stopped working.
 *
 * Deliberately offline: it reads the committed file, so it is safe to run
 * anywhere, any time. Asking whether the *reference* has moved is a different
 * question, and a networked one — `npm run check:policy-schemas`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_TYPES } from '../server/src/lib/policyTemplates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client/src/lib/generated/apigeePolicyElements.ts');

const source = await readFile(OUT, 'utf8');

/** The catalogue object literal, read back out of the generated module. */
function parseCatalogue(text, name) {
  const at = text.indexOf(`export const ${name}`);
  assert.ok(at !== -1, `${name} is missing from the generated file`);
  const open = text.indexOf('= {', at) + 2;
  const body = text.slice(open);
  const close = body.indexOf('\n};');
  assert.ok(close !== -1, `${name} is not terminated`);
  return JSON.parse(body.slice(0, close + 2));
}

const catalogue = parseCatalogue(source, 'GENERATED_POLICY_ELEMENTS');
const slugs = parseCatalogue(source, 'GENERATED_DOC_SLUGS');

/** Every node in the catalogue, with the attributes hanging off it. */
function* walk(def) {
  yield def;
  for (const child of def.children || []) yield* walk(child);
}
const nodes = Object.values(catalogue).flatMap((def) => [...walk(def)]);
const attrs = nodes.flatMap((n) => n.attrs || []);
/**
 * How many nodes and attributes carry a fact.
 *
 * `required` counts by truth, not by presence: an explicit `required: false`
 * is the absence of a requirement, and counting it would let the catalogue
 * lose every marker while this test went on passing. `default` counts by
 * presence, because `default: "false"` is a real default.
 */
const countOf = (key) => {
  const has = key === 'required' ? (x) => x[key] === true : (x) => x[key] !== undefined;
  return nodes.filter(has).length + attrs.filter(has).length;
};

test('covers every policy type the app offers', () => {
  const missing = POLICY_TYPES.map((p) => p.xmlTag || p.key)
    .filter((tag, i, all) => all.indexOf(tag) === i)
    .filter((tag) => !catalogue[tag]);
  assert.deepEqual(missing, [], `no element tree for: ${missing.join(', ')}`);
});

test('each tree is keyed by its own root tag', () => {
  for (const [tag, def] of Object.entries(catalogue)) assert.equal(def.name, tag);
});

test('every covered tag has a documentation slug', () => {
  const missing = Object.keys(catalogue).filter((tag) => !slugs[tag]);
  assert.deepEqual(missing, [], `no doc slug for: ${missing.join(', ')}`);
});

// Floors sit well below the current totals, which the generated file's own
// header records. They are here to catch a parser that broke, not to pin the
// documentation in place.
test('structure has not collapsed', () => {
  assert.ok(nodes.length >= 800, `only ${nodes.length} elements`);
  assert.ok(nodes.filter((n) => n.doc).length >= 550, 'documentation has thinned out');
});

test('the reference tables are still being read', () => {
  // Each of these was zero before the tables were parsed at all, so a drop back
  // to zero is the exact regression this exists to catch.
  assert.ok(countOf('values') >= 70, `only ${countOf('values')} enumerations`);
  assert.ok(countOf('required') >= 90, `only ${countOf('required')} required markers`);
  assert.ok(countOf('default') >= 70, `only ${countOf('default')} defaults`);
});

test('no enumeration is empty or single-valued', () => {
  for (const node of [...nodes, ...attrs]) {
    if (!node.values) continue;
    assert.ok(node.values.length >= 2, `<${node.name}> has a one-value enumeration`);
    assert.deepEqual(node.values, [...new Set(node.values)], `<${node.name}> repeats a value`);
  }
});

test('records when it was generated', () => {
  const stamp = source.match(/^\/\/ Generated (\d{4}-\d{2}-\d{2})\./m);
  assert.ok(stamp, 'the generated file carries no date stamp');
  assert.ok(!Number.isNaN(Date.parse(stamp[1])), `unparseable date stamp: ${stamp[1]}`);
});
