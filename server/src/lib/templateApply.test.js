// Tests for the import-plus-template merge.
//
// What is worth pinning down here is not that the fields copy across — it is
// the conflict rule, since that is the part a user cannot see happening. Every
// case below is one where the template and the imported surface disagree, and
// the assertion is always the same shape: the surface won, and a warning said
// so out loud.

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplateToProxy, describeChanges } from './templateApply.js';
import { createBlankProxy } from './model.js';

function importedProxy(overrides = {}) {
  // Stands in for what an importer hands back: a surface with real flows and a
  // real backend, and no policy layer to speak of.
  const base = createBlankProxy({ name: 'petstore', basePath: '/petstore' });
  return {
    ...base,
    targets: [{ ...base.targets[0], url: { mode: 'literal', value: 'https://api.petstore.io' } }],
    flows: [
      {
        id: 'f1',
        name: 'List pets',
        conditionMode: 'simple',
        pathValue: '/pets',
        pathOperator: 'MatchesPath',
        verb: 'GET',
        condition: '(proxy.pathsuffix MatchesPath "/pets") and (request.verb = "GET")',
        request: [{ policyName: 'OAS-Validate' }],
        response: [],
      },
    ],
    policies: [{ id: 'p1', name: 'OAS-Validate', type: 'OASValidation', xml: '<OASValidation/>' }],
    ...overrides,
  };
}

function template(proxy) {
  return { id: 'tpl-test', name: 'Test Template', proxy };
}

test('template supplies the policy layer, import keeps the surface', () => {
  const tpl = template({
    name: 'secured-api',
    basePath: '/secured-api',
    policies: [
      { id: 'VA', name: 'VA-VerifyApiKey', type: 'VerifyAPIKey', xml: '<VerifyAPIKey/>' },
      { id: 'SA', name: 'SA-SpikeArrest', type: 'SpikeArrest', xml: '<SpikeArrest/>' },
    ],
    preFlow: { request: [{ policyName: 'SA-SpikeArrest' }, { policyName: 'VA-VerifyApiKey' }], response: [] },
    postFlow: { request: [], response: [] },
    flows: [],
    targets: [{ id: 't', name: 'default', mode: 'url', url: { mode: 'literal', value: 'https://mocktarget.apigee.net' } }],
    routeRules: [{ id: 'rr', name: 'default', targetName: 'default', condition: '' }],
    faultRules: { steps: [] },
  });

  const { proxy, changes } = applyTemplateToProxy(importedProxy(), tpl);

  assert.equal(proxy.name, 'petstore');
  assert.equal(proxy.basePath, '/petstore');
  assert.equal(proxy.targets[0].url.value, 'https://api.petstore.io');
  assert.deepEqual(proxy.policies.map((p) => p.name), ['OAS-Validate', 'VA-VerifyApiKey', 'SA-SpikeArrest']);
  assert.deepEqual(proxy.preFlow.request.map((s) => s.policyName), ['SA-SpikeArrest', 'VA-VerifyApiKey']);
  assert.equal(changes.policies, 2);
  assert.equal(changes.flowSteps, 2);
  // The imported flow and its OASValidation step are untouched.
  assert.equal(proxy.flows.length, 1);
  assert.deepEqual(proxy.flows[0].request.map((s) => s.policyName), ['OAS-Validate']);
});

test('the template\'s own backend is never applied over the imported one', () => {
  const tpl = template({
    policies: [],
    preFlow: { request: [], response: [] },
    targets: [{ id: 't', name: 'default', mode: 'url', url: { mode: 'literal', value: 'https://mocktarget.apigee.net' } }],
  });
  const { proxy, warnings } = applyTemplateToProxy(importedProxy(), tpl);
  assert.equal(proxy.targets[0].url.value, 'https://api.petstore.io');
  assert.ok(warnings.some((w) => w.includes('Kept the imported backend')));
});

test('template steps run before the imported ones', () => {
  const tpl = template({
    policies: [{ id: 'VA', name: 'VA-VerifyApiKey', type: 'VerifyAPIKey', xml: '<VerifyAPIKey/>' }],
    preFlow: { request: [{ policyName: 'VA-VerifyApiKey' }], response: [] },
    targets: [],
  });
  const imported = importedProxy({ preFlow: { request: [{ policyName: 'OAS-Validate' }], response: [] } });
  const { proxy } = applyTemplateToProxy(imported, tpl);
  assert.deepEqual(proxy.preFlow.request.map((s) => s.policyName), ['VA-VerifyApiKey', 'OAS-Validate']);
});

test('a policy name collision keeps the proxy\'s version and warns', () => {
  const tpl = template({
    policies: [{ id: 'x', name: 'OAS-Validate', type: 'OASValidation', xml: '<OASValidation>template</OASValidation>' }],
    preFlow: { request: [], response: [] },
    targets: [],
  });
  const { proxy, warnings, changes } = applyTemplateToProxy(importedProxy(), tpl);
  assert.equal(proxy.policies.length, 1);
  assert.equal(proxy.policies[0].xml, '<OASValidation/>');
  assert.equal(changes.policies, 0);
  assert.ok(warnings.some((w) => w.includes('OAS-Validate')));
});

test('a template flow that duplicates an imported condition is skipped, not shadowed', () => {
  const condition = '(proxy.pathsuffix MatchesPath "/pets") and (request.verb = "GET")';
  const tpl = template({
    policies: [],
    preFlow: { request: [], response: [] },
    targets: [],
    flows: [
      { id: 'dup', name: 'Pets', condition, conditionMode: 'simple', request: [], response: [] },
      { id: 'health', name: 'Health Check', condition: '(proxy.pathsuffix MatchesPath "/health")', conditionMode: 'simple', request: [], response: [] },
    ],
  });
  const { proxy, warnings, changes } = applyTemplateToProxy(importedProxy(), tpl);
  assert.deepEqual(proxy.flows.map((f) => f.name), ['List pets', 'Health Check']);
  assert.equal(changes.flows, 1);
  assert.ok(warnings.some((w) => w.includes('Pets')));
});

test('fault handling is all-or-nothing', () => {
  const tpl = template({
    policies: [{ id: 'RF', name: 'RF-NotFound', type: 'RaiseFault', xml: '<RaiseFault/>' }],
    preFlow: { request: [], response: [] },
    targets: [],
    faultRules: { steps: [{ policyName: 'RF-NotFound' }] },
  });

  // Nothing there yet -> the template's handling is adopted whole.
  const fresh = applyTemplateToProxy(importedProxy(), tpl);
  assert.deepEqual(fresh.proxy.faultRules.steps.map((s) => s.policyName), ['RF-NotFound']);

  // Already has its own -> untouched, and said so.
  const owned = importedProxy({ faultRules: { rules: [], steps: [{ policyName: 'RF-Mine' }] } });
  const kept = applyTemplateToProxy(owned, tpl);
  assert.deepEqual(kept.proxy.faultRules.steps.map((s) => s.policyName), ['RF-Mine']);
  assert.ok(kept.warnings.some((w) => w.includes('fault handling')));
});

test('extra template targets are not added, since nothing routes to them', () => {
  const tpl = template({
    policies: [],
    preFlow: { request: [], response: [] },
    targets: [
      { id: 'a', name: 'default', mode: 'url', url: { mode: 'literal', value: 'https://api.petstore.io' } },
      { id: 'b', name: 'secondary', mode: 'url', url: { mode: 'literal', value: 'https://other.example' } },
    ],
  });
  const { proxy, warnings } = applyTemplateToProxy(importedProxy(), tpl);
  assert.equal(proxy.targets.length, 1);
  assert.ok(warnings.some((w) => w.includes('extra ones were not added')));
});

test('applying a template twice adds nothing the second time', () => {
  const tpl = template({
    policies: [{ id: 'VA', name: 'VA-VerifyApiKey', type: 'VerifyAPIKey', xml: '<VerifyAPIKey/>' }],
    preFlow: { request: [{ policyName: 'VA-VerifyApiKey' }], response: [] },
    targets: [],
  });
  const once = applyTemplateToProxy(importedProxy(), tpl);
  const twice = applyTemplateToProxy(once.proxy, tpl);
  assert.equal(twice.changes.policies, 0);
  assert.equal(twice.changes.flowSteps, 0);
  assert.deepEqual(twice.proxy.preFlow.request.map((s) => s.policyName), ['VA-VerifyApiKey']);
  assert.equal(describeChanges(twice.changes), 'added nothing new');
});

test('the merged proxy comes back normalized', () => {
  const tpl = template({ policies: [], preFlow: { request: [], response: [] }, targets: [] });
  const { proxy } = applyTemplateToProxy(importedProxy(), tpl);
  // normalizeProxy fills these in; the bundle generator reads them unguarded.
  assert.ok(Array.isArray(proxy.resources));
  assert.ok(Array.isArray(proxy.faultRules.rules));
  assert.equal(proxy.flows[0].enabled, true);
});

test('describeChanges reads as a sentence', () => {
  assert.equal(
    describeChanges({ policies: 5, flowSteps: 3, flows: 1, faultRules: 0, resources: 0 }),
    'added 5 policies, 3 flow steps, 1 conditional flow'
  );
});
