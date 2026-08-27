// Round-trip fidelity harness for the 26-odd importer/generator modules that
// have no other regression coverage. Two directions, run against every
// built-in template plus anything dropped into server/test-bundles/*.zip
// (gitignored — that's where real bundles exported from your own Apigee org
// belong; five or six is plenty):
//
//   1. generator -> importer (model fidelity): build a bundle from a proxy,
//      reparse it, and the model should come back the same (modulo fields
//      that are genuinely Studio-only metadata Apigee's XML has no room for —
//      see normalizeForCompare below).
//   2. importer -> generator (XML fidelity): parse a bundle, regenerate it,
//      and the file set should match modulo formatting (canonicalizeXml
//      strips whitespace/attribute-order/comment noise).
//
//   node scripts/roundtrip.mjs
//
// Exits non-zero if any bundle fails either direction.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { diffLines } from 'diff';
import { BUILT_IN_TEMPLATES } from '../server/src/seed/templates.js';
import { normalizeProxy } from '../server/src/lib/model.js';
import { generateBundleFiles } from '../server/src/lib/bundleGenerator.js';
import { importProxyZip, importProxyFromFiles } from '../server/src/lib/bundleImporter.js';
import { canonicalizeXml } from '../server/src/lib/canonicalXml.js';
import { getPolicyType } from '../server/src/lib/policyTemplates.js';
import { iterateSteps } from '../server/src/lib/deployChecks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.resolve(__dirname, '../server/test-bundles');

// ------------------------------------------------------------- Direction 1

// Drops fields that are either regenerated per-parse (ids) or genuinely
// Studio-only design-time metadata that Apigee's XML has no representation
// for at all (Flow.contract, and the Path/Verb-builder fields once a flow's
// `condition` string has already captured their effect). Keep this list
// short and explicit — every field added here is a field this harness stops
// protecting.
function stripFlow(f) {
  return { name: f.name, description: f.description || '', condition: f.condition || '', request: f.request, response: f.response };
}
// Studio has a handful of "friendly" policy types (CorsHeaders,
// MessageLoggingSyslog, ...) that are really just a specific shape of a more
// generic XML tag (AssignMessage, MessageLogging) — Apigee's XML has no field
// that says "this AssignMessage is specifically a CorsHeaders", so the
// importer can only ever recover the raw tag. Normalizing both sides through
// the same tag mapping compares what's actually recoverable rather than
// flagging this permanent, documented one-way distinction as a regression.
function policyTag(type) {
  return getPolicyType(type)?.xmlTag || type;
}
function stripPolicy(p) {
  // No `resource`: resource files live only in proxy.resources now (see
  // foldPolicyResources in model.js), and are compared via stripResource.
  return { name: p.name, type: policyTag(p.type), xml: p.xml };
}
// FaultRule ids are Studio-only — an Apigee bundle has nowhere to store one, so
// the importer mints a fresh id per parse. Compare the rules on what actually
// survives the trip: name, condition and steps, in order.
function stripFaultRules(fr) {
  return {
    steps: fr?.steps || [],
    rules: (fr?.rules || []).map((r) => ({ name: r.name, condition: r.condition || '', steps: r.steps })),
  };
}
function stripTarget(t) {
  const { id, flows, faultRules, ...rest } = t;
  return { ...rest, flows: (flows || []).map(stripFlow), faultRules: stripFaultRules(faultRules) };
}
function stripRouteRule(r) {
  return { name: r.name, targetName: r.targetName, condition: r.condition || '', mode: r.mode || 'target', url: r.url || '' };
}
function stripResource(r) {
  return { path: r.path, content: r.content };
}

// Only the shape actually encoded in the generated bundle — tests,
// environments and lintExcludes are Studio-only and never touch a single
// file the generator writes, so a real Apigee round-trip can never return
// them either. That's expected, not a fidelity bug, so they're excluded
// rather than asserted-away as "stripped volatile fields".
function normalizeForCompare(proxy) {
  return {
    name: proxy.name,
    basePath: proxy.basePath,
    description: proxy.description || '',
    proxyEndpointName: proxy.proxyEndpointName || 'default',
    policies: (proxy.policies || []).map(stripPolicy),
    targets: (proxy.targets || []).map(stripTarget),
    preFlow: proxy.preFlow,
    postFlow: proxy.postFlow,
    postClientFlow: proxy.postClientFlow,
    flows: (proxy.flows || []).map(stripFlow),
    routeRules: (proxy.routeRules || []).map(stripRouteRule),
    faultRules: stripFaultRules(proxy.faultRules),
    resources: (proxy.resources || []).map(stripResource),
  };
}

function checkModelFidelity(proxy) {
  const files = generateBundleFiles(proxy);
  const { proxy: reparsed } = importProxyFromFiles(files);
  assert.deepStrictEqual(normalizeForCompare(reparsed), normalizeForCompare(proxy));
}

// ------------------------------------------------------------- Direction 2

function zipFromFiles(files) {
  const zip = new AdmZip();
  for (const [relPath, content] of Object.entries(files)) zip.addFile(relPath, Buffer.from(content, 'utf-8'));
  return zip.toBuffer();
}

function zipToFiles(buffer) {
  const zip = new AdmZip(buffer);
  const files = {};
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    files[entry.entryName.replace(/\\/g, '/')] = entry.getData().toString('utf-8');
  }
  return files;
}

// Compares two file maps, canonicalizing XML files and comparing everything
// else (policy resources — JS, properties, ...) as raw text. Returns a list
// of { path, kind: 'added' | 'removed' | 'changed', diff? }.
function diffFileMaps(left, right) {
  const paths = new Set([...Object.keys(left), ...Object.keys(right)]);
  const mismatches = [];
  for (const p of [...paths].sort()) {
    const a = left[p];
    const b = right[p];
    if (a === undefined) {
      mismatches.push({ path: p, kind: 'added' });
      continue;
    }
    if (b === undefined) {
      mismatches.push({ path: p, kind: 'removed' });
      continue;
    }
    const [ca, cb] = p.endsWith('.xml') ? [canonicalizeXml(a), canonicalizeXml(b)] : [a, b];
    if (ca !== cb) mismatches.push({ path: p, kind: 'changed', diff: diffLines(ca, cb) });
  }
  return mismatches;
}

function checkXmlFidelity(zipBuffer) {
  const originalFiles = zipToFiles(zipBuffer);
  const { proxy } = importProxyZip(zipBuffer);
  const regenerated = generateBundleFiles(proxy);
  return diffFileMaps(originalFiles, regenerated);
}

// ------------------------------------------------------------------- Runner

function printDiff(mismatch) {
  console.log(`      ${mismatch.kind.padEnd(8)} ${mismatch.path}`);
  if (mismatch.kind !== 'changed') return;
  for (const part of mismatch.diff) {
    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
    const color = part.added ? '\x1b[32m' : part.removed ? '\x1b[31m' : '\x1b[2m';
    for (const line of part.value.split('\n').filter((l, i, arr) => l !== '' || i < arr.length - 1)) {
      console.log(`      ${color}${prefix}${line}\x1b[0m`);
    }
  }
}

let anyFailed = false;
const rows = [];

function runBundle(label, zipBuffer) {
  let modelIssue = null;
  let xmlMismatches = [];
  try {
    const { proxy } = importProxyZip(zipBuffer);
    checkModelFidelity(proxy);
  } catch (err) {
    modelIssue = err;
  }
  try {
    xmlMismatches = checkXmlFidelity(zipBuffer);
  } catch (err) {
    xmlMismatches = [{ path: '(exception)', kind: 'changed', diff: [{ value: err.stack || err.message, removed: true }] }];
  }

  const failed = !!modelIssue || xmlMismatches.length > 0;
  anyFailed = anyFailed || failed;
  rows.push({ label, pass: !failed });

  console.log(`\n${failed ? 'FAIL' : 'PASS'}  ${label}`);
  if (modelIssue) {
    console.log('      generator -> importer: model mismatch');
    console.log(
      String(modelIssue.message)
        .split('\n')
        .slice(0, 40)
        .map((l) => `      ${l}`)
        .join('\n')
    );
  }
  if (xmlMismatches.length) {
    console.log(`      importer -> generator: ${xmlMismatches.length} file(s) differ (showing first)`);
    printDiff(xmlMismatches[0]);
  }
}

console.log('=== Built-in templates ===');
for (const template of BUILT_IN_TEMPLATES) {
  const proxy = normalizeProxy(structuredClone(template.proxy));
  // checkModelFidelity is run standalone here (not via runBundle) because it
  // starts from the *model*, not a zip — building a zip from the generator's
  // own output first (as runBundle's importProxyZip path does) would still
  // exercise it, but going through the model directly gives a cleaner
  // isolated signal for direction 1 before direction 2 even runs.
  let modelIssue = null;
  try {
    checkModelFidelity(proxy);
  } catch (err) {
    modelIssue = err;
  }
  const zipBuffer = zipFromFiles(generateBundleFiles(proxy));
  const xmlMismatches = checkXmlFidelity(zipBuffer);
  const failed = !!modelIssue || xmlMismatches.length > 0;
  anyFailed = anyFailed || failed;
  rows.push({ label: template.name, pass: !failed });
  console.log(`\n${failed ? 'FAIL' : 'PASS'}  ${template.name}`);
  if (modelIssue) {
    console.log('      generator -> importer: model mismatch');
    console.log(
      String(modelIssue.message)
        .split('\n')
        .slice(0, 40)
        .map((l) => `      ${l}`)
        .join('\n')
    );
  }
  if (xmlMismatches.length) {
    console.log(`      importer -> generator: ${xmlMismatches.length} file(s) differ (showing first)`);
    printDiff(xmlMismatches[0]);
  }
}

// Synthetic case: a Javascript policy with its own script AND an <IncludeURL>
// pointing at a resources/jsc/utils.js shared helper that belongs to no policy
// — historically dropped on import with no warning. Deliberately declared the
// legacy way (`policy.resource`) so normalizeProxy's foldPolicyResources has to
// migrate it into proxy.resources; the assertions below check that it did,
// since a fold that silently dropped the file would otherwise still round-trip
// consistently and pass.
{
  const base = normalizeProxy(structuredClone(BUILT_IN_TEMPLATES[0].proxy));
  const jsPolicy = {
    id: 'jsc-uses-shared',
    name: 'JS-UsesShared',
    type: 'Javascript',
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Javascript name="JS-UsesShared">\n    <DisplayName>JS-UsesShared</DisplayName>\n    <IncludeURL>jsc://utils.js</IncludeURL>\n    <ResourceURL>jsc://JS-UsesShared.js</ResourceURL>\n</Javascript>`,
    resource: { path: 'resources/jsc/JS-UsesShared.js', content: '// own file' },
  };
  const proxy = normalizeProxy({
    ...base,
    name: 'resources-check',
    basePath: '/resources-check',
    policies: [jsPolicy],
    resources: [{ id: 'res-utils', path: 'resources/jsc/utils.js', content: 'function shared() {}' }],
    preFlow: { request: [{ policyName: 'JS-UsesShared' }], response: [] },
  });

  const paths = proxy.resources.map((r) => r.path).sort();
  assert.deepStrictEqual(paths, ['resources/jsc/JS-UsesShared.js', 'resources/jsc/utils.js'], 'fold must migrate policy.resource into proxy.resources');
  assert.equal(proxy.policies[0].resource, undefined, 'fold must drop the legacy policy.resource field');

  runBundle('(synthetic) policy.resource fold + shared resource sweep', zipFromFiles(generateBundleFiles(proxy)));
}

// iterateSteps (deployChecks.js) must see every Step position the generator
// actually emits, or DEPLOY006 silently stops catching dangling policy
// references there — an export-blocking error quietly becoming a no-op. This
// originally shipped missing ProxyEndpoint PreFlow Response and PostFlow
// Request. Rather than pin those two cases, plant a uniquely-named ghost step
// in every position the model supports and assert the two sides agree.
{
  const ghost = (slot) => [{ policyName: `GHOST-${slot}` }];
  const proxy = normalizeProxy({
    name: 'step-coverage',
    basePath: '/step-coverage',
    proxyEndpointName: 'default',
    policies: [],
    preFlow: { request: ghost('pe-preflow-req'), response: ghost('pe-preflow-res') },
    postFlow: { request: ghost('pe-postflow-req'), response: ghost('pe-postflow-res') },
    postClientFlow: { response: ghost('pe-postclientflow-res') },
    flows: [{ id: 'f1', name: 'F1', request: ghost('pe-flow-req'), response: ghost('pe-flow-res') }],
    faultRules: {
      steps: ghost('pe-faultrule'),
      rules: [{ id: 'pefr1', name: 'PE-Conditional', condition: 'error.message = "boom"', steps: ghost('pe-faultrule-cond') }],
    },
    targets: [
      {
        id: 't1',
        name: 'default',
        mode: 'url',
        url: { mode: 'literal', value: 'https://example.com' },
        preFlow: { request: ghost('te-preflow-req'), response: ghost('te-preflow-res') },
        postFlow: { request: ghost('te-postflow-req'), response: ghost('te-postflow-res') },
        flows: [{ id: 'tf1', name: 'TF1', request: ghost('te-flow-req'), response: ghost('te-flow-res') }],
        faultRules: {
          steps: ghost('te-faultrule'),
          rules: [{ id: 'tefr1', name: 'TE-Conditional', condition: 'error.status.code = 500', steps: ghost('te-faultrule-cond') }],
        },
        eventFlow: { contentType: 'text/event-stream', response: ghost('te-eventflow-res') },
      },
    ],
    routeRules: [{ id: 'rr', name: 'default', targetName: 'default' }],
  });

  const emitted = new Set(
    Object.values(generateBundleFiles(proxy))
      .flatMap((xml) => [...String(xml).matchAll(/<Name>(GHOST-[a-z-]+)<\/Name>/g)])
      .map((m) => m[1])
  );
  const seen = new Set([...iterateSteps(proxy)].map((e) => e.step.policyName));
  const missed = [...emitted].filter((n) => !seen.has(n)).sort();
  const phantom = [...seen].filter((n) => !emitted.has(n)).sort();

  const failed = missed.length > 0 || phantom.length > 0;
  anyFailed = anyFailed || failed;
  rows.push({ label: '(synthetic) iterateSteps position coverage', pass: !failed });
  console.log(`\n${failed ? 'FAIL' : 'PASS'}  (synthetic) iterateSteps position coverage`);
  if (missed.length) {
    console.log(`      ${missed.length} position(s) in the bundle that iterateSteps never yields:`);
    for (const n of missed) console.log(`        ${n}`);
    console.log('      => DEPLOY006 cannot see dangling policy references there.');
  }
  if (phantom.length) {
    console.log(`      iterateSteps yields ${phantom.length} step(s) the generator never emits: ${phantom.join(', ')}`);
  }
}

if (existsSync(CORPUS_DIR)) {
  const zipFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.zip'));
  if (zipFiles.length) {
    console.log('\n=== server/test-bundles/*.zip ===');
    for (const file of zipFiles) {
      const buffer = readFileSync(path.join(CORPUS_DIR, file));
      runBundle(file, buffer);
    }
  } else {
    console.log(
      '\n(no *.zip files in server/test-bundles/ — drop in a handful of bundles exported from your own Apigee org for the widest coverage)'
    );
  }
}

console.log(`\n${rows.length} bundle(s) checked — ${rows.filter((r) => r.pass).length} passed, ${rows.filter((r) => !r.pass).length} failed.`);
process.exit(anyFailed ? 1 : 0);
