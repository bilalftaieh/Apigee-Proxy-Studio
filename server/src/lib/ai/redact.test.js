// Run with: npm run test:ai
//
// These are the tests worth having in this feature. Everything else here can be
// checked by looking at it; whether a hostname escapes to Google cannot.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectProxySecrets,
  createRedactionMap,
  pseudonymize,
  restore,
  secretValues,
} from './redact.js';
import { assertNoLeak, findLeaks, LeakError } from './guard.js';
import { buildSafeContext } from './safeContext.js';

const SENSITIVE_PROXY = {
  name: 'acme-payments',
  basePath: '/v1/payments',
  targets: [
    {
      url: { mode: 'literal', value: 'https://api.acmebank.internal/v1' },
      targetServers: ['ts-payments-prod-01'],
      sslInfo: { enabled: true, keyStore: 'acme-prod-keystore' },
    },
  ],
  routeRules: [{ name: 'default', url: 'https://legacy.acmebank.internal' }],
  policies: [
    {
      name: 'KVM-Secrets',
      type: 'KeyValueMapOperations',
      xml: '<KeyValueMapOperations><mapIdentifier>acme-prod-secrets</mapIdentifier></KeyValueMapOperations>',
    },
  ],
};

test('collects every sensitive literal from the proxy model', () => {
  const map = collectProxySecrets(SENSITIVE_PROXY, createRedactionMap());
  const values = secretValues(map);
  for (const expected of [
    'https://api.acmebank.internal/v1',
    'ts-payments-prod-01',
    'acme-prod-keystore',
    'https://legacy.acmebank.internal',
    'acme-prod-secrets',
  ]) {
    assert.ok(values.includes(expected), `expected ${expected} to be registered`);
  }
});

test('round-trips: the model sees placeholders, the caller gets real values back', () => {
  const map = collectProxySecrets(SENSITIVE_PROXY, createRedactionMap());
  const sent = pseudonymize('route to https://api.acmebank.internal/v1 via ts-payments-prod-01', map);

  assert.ok(!sent.includes('acmebank'), 'hostname must not survive into the prompt');
  assert.ok(!sent.includes('ts-payments-prod-01'), 'target server must not survive into the prompt');
  assert.match(sent, /\{\{URL_\d+\}\}/);

  assert.equal(restore(sent, map), 'route to https://api.acmebank.internal/v1 via ts-payments-prod-01');
});

test('catches hostnames the proxy never declared', () => {
  const map = createRedactionMap();
  const sent = pseudonymize('call out to secret-svc.corp.example.org first', map);
  assert.ok(!sent.includes('secret-svc'), 'unregistered hostnames must still be caught');
  assert.equal(restore(sent, map), 'call out to secret-svc.corp.example.org first');
});

test('catches emails, IPs and secret-shaped strings', () => {
  const map = createRedactionMap();
  const sent = pseudonymize(
    'allow 10.42.13.7, notify ops@acmebank.internal, key AKIAIOSFODNN7EXAMPLEKEYVALUE123',
    map
  );
  assert.ok(!sent.includes('10.42.13.7'));
  assert.ok(!sent.includes('ops@acmebank.internal'));
  assert.ok(!sent.includes('AKIAIOSFODNN7EXAMPLEKEYVALUE123'));
});

test('leaves Apigee flow variables alone so output quality does not suffer', () => {
  const map = createRedactionMap();
  const sent = pseudonymize(
    'key the cache by request.header.client_id and response.status.code',
    map
  );
  assert.equal(sent, 'key the cache by request.header.client_id and response.status.code');
});

test('a short target server name does not shred unrelated words', () => {
  // A TargetServer literally named "api" is ordinary. Substring replacement
  // would rewrite every "api" in the prompt, including inside "Apigee".
  const map = collectProxySecrets({ targets: [{ targetServers: ['api'] }], policies: [] }, createRedactionMap());
  const sent = pseudonymize('Configure the Apigee policy and route to api for rapid lookup', map);

  assert.match(sent, /Apigee/, 'Apigee must survive intact');
  assert.match(sent, /rapid/, 'rapid must survive intact');
  assert.match(sent, /route to \{\{TARGETSERVER_1\}\} for/, 'the standalone name must still be replaced');
});

test('the same value always gets the same placeholder', () => {
  const map = createRedactionMap();
  const sent = pseudonymize('from https://a.example.com to https://a.example.com', map);
  const tokens = sent.match(/\{\{URL_\d+\}\}/g);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0], tokens[1]);
});

test('buildSafeContext emits only allowlisted fields', () => {
  const { context } = buildSafeContext(SENSITIVE_PROXY, {
    policyType: 'ResponseCache',
    intent: 'cache responses from https://api.acmebank.internal/v1 for 5 minutes',
  });

  assert.deepEqual(
    Object.keys(context).sort(),
    ['commonFlowVariables', 'intent', 'policyCategory', 'policyLabel', 'policyRootTag', 'policyType', 'template'].sort()
  );

  const serialized = JSON.stringify(context);
  assert.ok(!serialized.includes('acmebank'), 'no hostname');
  assert.ok(!serialized.includes('acme-payments'), 'no proxy name');
  assert.ok(!serialized.includes('/v1/payments'), 'no basepath');
  assert.ok(!serialized.includes('acme-prod-secrets'), 'no KVM name');
});

test('the guard passes a properly built context', () => {
  const { context } = buildSafeContext(SENSITIVE_PROXY, {
    policyType: 'ResponseCache',
    intent: 'cache responses from https://api.acmebank.internal/v1',
  });
  assert.equal(assertNoLeak(context, SENSITIVE_PROXY), true);
});

test('the guard fails closed when the allowlist is bypassed', () => {
  // Simulates the bug the guard exists to catch: a future change that drops a
  // raw proxy field straight into the payload.
  const leaky = { policyType: 'ResponseCache', note: `target is ${SENSITIVE_PROXY.targets[0].url.value}` };

  assert.throws(() => assertNoLeak(leaky, SENSITIVE_PROXY), LeakError);
  assert.equal(findLeaks(leaky, SENSITIVE_PROXY)[0].value, 'https://api.acmebank.internal/v1');
});

test('the guard ignores values too generic to be evidence', () => {
  const proxy = { targets: [{ targetServers: ['default'] }], policies: [] };
  assert.equal(findLeaks({ text: 'the default flow' }, proxy).length, 0);
});

// A multi-line chunk, so the subtraction is exercised against both the raw form
// and the JSON-escaped form it takes once the payload is serialized.
const GRAMMAR = ['<ServiceCallout>', '  <Authentication>', '    <HeaderName>'].join(String.fromCharCode(10));

test('our own grammar is not mistaken for workspace data', () => {
  // `Authentication` is a real Apigee element AND an unremarkable TargetServer
  // name. Before the guard learned to discount the text this repo contributes,
  // that collision aborted every generation on such a proxy with "this is a bug
  // in the prompt builder" — and a fail-closed guard that cries wolf gets
  // switched off.
  const proxy = { targets: [{ targetServers: [{ name: 'Authentication' }] }], policies: [] };
  const payload = { prompt: ['Request: call the backend', GRAMMAR].join(String.fromCharCode(10)) };

  assert.equal(findLeaks(payload, proxy, [GRAMMAR]).length, 0);
});

test('discounting static text narrows where the guard looks, not what it looks for', () => {
  const proxy = { targets: [{ targetServers: [{ name: 'Authentication' }] }], policies: [] };
  // The same name, this time in the one line that carries the user's words.
  const leaky = { prompt: ['Request: route via Authentication', GRAMMAR].join(String.fromCharCode(10)) };

  assert.equal(findLeaks(leaky, proxy, [GRAMMAR])[0].value, 'Authentication');
});

test('static text cannot be used to hide a real secret', () => {
  const leaky = {
    prompt: [`Request: call ${SENSITIVE_PROXY.targets[0].url.value}`, GRAMMAR].join(String.fromCharCode(10)),
  };
  assert.throws(() => assertNoLeak(leaky, SENSITIVE_PROXY, [GRAMMAR]), LeakError);
});

test('the workspace identity fields are registered too', () => {
  // None of this reaches the prompt by any path — but it is exactly what a user
  // types into the intent box, and registering it is what lets pseudonymize()
  // catch it there by exact match instead of hoping a regex notices.
  const map = collectProxySecrets(SENSITIVE_PROXY, createRedactionMap());
  const values = secretValues(map);

  assert.ok(values.includes('acme-payments'), 'proxy name');
  assert.ok(values.includes('/v1/payments'), 'basepath');

  const intent = pseudonymize('add caching to acme-payments under /v1/payments', map);
  assert.ok(!intent.includes('acme-payments'));
  assert.ok(!intent.includes('/v1/payments'));
  assert.equal(restore(intent, map), 'add caching to acme-payments under /v1/payments');
});

test('per-environment target overrides are collected as well', () => {
  // The second set of backends, and the easiest to miss: the target they
  // override already looks handled.
  const proxy = {
    targets: [{ id: 't1', url: { value: 'https://dev.example-corp.test' }, targetServers: [] }],
    environments: [
      {
        id: 'e1',
        name: 'prod-eu',
        targetOverrides: {
          t1: {
            mode: 'url',
            url: { value: 'https://payments.acmebank.internal' },
            path: { value: '/internal/v2' },
            targetServers: ['ts-eu-prod-07'],
          },
        },
      },
    ],
    policies: [],
  };

  const values = secretValues(collectProxySecrets(proxy, createRedactionMap()));
  for (const expected of ['prod-eu', 'https://payments.acmebank.internal', '/internal/v2', 'ts-eu-prod-07']) {
    assert.ok(values.includes(expected), `${expected} must be registered`);
  }
});
