// Exercises the review loop with a stubbed network.
//
// A review cannot be tested for being right — that is the nature of the
// feature. What these cover is everything around it that CAN be pinned down:
// what leaves the machine, what is thrown away before the user sees it, and
// that the execution order the model reasons about is Apigee's real one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { reviewProxy, previewReviewRequest } from './reviewProxy.js';

function geminiReply(object) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(object) }] } }],
    }),
  };
}

function stubGemini(replies) {
  const sent = [];
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body), raw: init.body });
    return geminiReply(replies[Math.min(call++, replies.length - 1)]);
  };
  return {
    sent,
    restore() {
      globalThis.fetch = original;
    },
  };
}

/**
 * A proxy with the shape of a real one: an auth check, a quota that runs too
 * late to be useful, a cache, and a backend whose details are all sensitive.
 */
function buildProxy() {
  return {
    name: 'acme-payments',
    basePath: '/v1/payments',
    proxyEndpointName: 'default',
    policies: [
      { id: 'p1', name: 'VK-VerifyKey', type: 'VerifyAPIKey', xml: '<VerifyAPIKey name="VK-VerifyKey"/>' },
      {
        id: 'p2',
        name: 'Q-Monthly',
        type: 'Quota',
        xml: '<Quota name="Q-Monthly"><Identifier ref="client_id"/></Quota>',
      },
      {
        id: 'p3',
        name: 'RC-Cache',
        type: 'ResponseCache',
        // Carries the backend URL, which is the exposure this feature adds.
        xml: '<ResponseCache name="RC-Cache"><CacheKey><Prefix>https://api.acmebank.internal/v1</Prefix></CacheKey></ResponseCache>',
      },
    ],
    preFlow: { request: [{ policyName: 'VK-VerifyKey' }], response: [] },
    postFlow: { request: [], response: [{ policyName: 'RC-Cache' }] },
    flows: [
      {
        name: 'GetBalance',
        condition: 'proxy.pathsuffix MatchesPath "/balance"',
        request: [],
        response: [],
      },
    ],
    routeRules: [{ name: 'default', mode: 'target', targetName: 'default' }],
    targets: [
      {
        name: 'default',
        mode: 'targetServer',
        url: { mode: 'literal', value: 'https://api.acmebank.internal/v1' },
        targetServers: ['ts-payments-prod-01'],
        // The quota runs on the target's request flow — after routing, and
        // after the proxy has already committed to the call.
        preFlow: { request: [{ policyName: 'Q-Monthly' }], response: [] },
        postFlow: { request: [], response: [] },
        flows: [],
        faultRules: { rules: [], steps: [] },
        sslInfo: { enabled: true, ignoreValidationErrors: true },
      },
    ],
    faultRules: { rules: [], steps: [] },
    resources: [],
  };
}

const GOOD_REVIEW = {
  summary: 'Authentication is in place, but the quota runs after the call it should protect.',
  findings: [
    {
      title: 'Quota runs after routing',
      severity: 'high',
      category: 'traffic-management',
      detail: 'Q-Monthly sits on the target request flow, so the call is already committed when it runs.',
      recommendation: 'Move Q-Monthly into the ProxyEndpoint PreFlow, right after VK-VerifyKey.',
      policyNames: ['Q-Monthly'],
      where: 'Target "default" PreFlow Request',
      fixKind: 'flow',
    },
  ],
};

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-not-real';
});

test('returns findings resolved to the real policies they name', async (t) => {
  const stub = stubGemini([GOOD_REVIEW]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });

  assert.equal(result.attempts, 1);
  assert.equal(result.dropped, 0);
  assert.equal(result.findings.length, 1);

  const finding = result.findings[0];
  assert.equal(finding.severity, 'high');
  assert.equal(finding.fixKind, 'flow');
  // Resolved server-side so the UI can offer a jump without re-deriving what
  // the server already established is real.
  assert.deepEqual(finding.policies, [
    { id: 'p2', name: 'Q-Monthly', type: 'Quota', label: 'Quota' },
  ]);
});

test('a finding naming a policy that does not exist is dropped, not repaired', async (t) => {
  // Guessing the closest real name would turn a finding about something absent
  // into a confident finding about something present — the worst repair there
  // is. It is dropped instead.
  const stub = stubGemini([
    {
      summary: 's',
      findings: [
        ...GOOD_REVIEW.findings,
        { ...GOOD_REVIEW.findings[0], title: 'Invented', policyNames: ['Q-Monthy'] },
      ],
    },
  ]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].title, 'Quota runs after routing');
  assert.equal(result.dropped, 1);
});

test('asks again when most of the answer was invented', async (t) => {
  const mostlyInvented = {
    summary: 's',
    findings: [
      { ...GOOD_REVIEW.findings[0], title: 'A', policyNames: ['Nope-1'] },
      { ...GOOD_REVIEW.findings[0], title: 'B', policyNames: ['Nope-2'] },
      { ...GOOD_REVIEW.findings[0], title: 'C', policyNames: ['Nope-3'] },
      ...GOOD_REVIEW.findings,
    ],
  };
  const stub = stubGemini([mostlyInvented, GOOD_REVIEW]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });

  assert.equal(result.attempts, 2);
  assert.equal(result.dropped, 0);
  assert.equal(result.findings.length, 1);

  // The retry has to say which names were wrong, or it is just a reroll.
  const retryPrompt = stub.sent[1].body.contents[0].parts[0].text;
  assert.match(retryPrompt, /policies that do not exist/);
  assert.match(retryPrompt, /Nope-2/);
});

test('one bad name among several does not trigger a retry', async (t) => {
  // A single miss is a typo worth dropping quietly. Asking again for it would
  // double the cost of most reviews to recover one finding.
  const stub = stubGemini([
    {
      summary: 's',
      findings: [
        { ...GOOD_REVIEW.findings[0], title: 'A' },
        { ...GOOD_REVIEW.findings[0], title: 'B', policyNames: ['RC-Cache'] },
        { ...GOOD_REVIEW.findings[0], title: 'C', policyNames: ['VK-VerifyKey'] },
        { ...GOOD_REVIEW.findings[0], title: 'D', policyNames: ['Ghost'] },
      ],
    },
  ]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });

  assert.equal(result.attempts, 1);
  assert.equal(stub.sent.length, 1);
  assert.equal(result.findings.length, 3);
  assert.equal(result.dropped, 1);
});

test('nothing sensitive reaches the wire', async (t) => {
  const stub = stubGemini([GOOD_REVIEW]);
  t.after(() => stub.restore());

  await reviewProxy({ proxy: buildProxy() });

  const wire = stub.sent[0].raw;
  for (const secret of ['acmebank', 'ts-payments-prod-01', 'acme-payments', '/v1/payments']) {
    assert.ok(!wire.includes(secret), `"${secret}" must not appear in the request body`);
  }
  // The backend URL was inside a policy's XML, which this feature does send.
  assert.match(wire, /\{\{URL_1\}\}/);
});

test('backend destinations are not sent in any form', async (t) => {
  const stub = stubGemini([GOOD_REVIEW]);
  t.after(() => stub.restore());

  await reviewProxy({ proxy: buildProxy() });

  const prompt = stub.sent[0].body.contents[0].parts[0].text;
  // The target is described by how it is wired, never by where it points — so
  // there is no placeholder standing in for a destination either, because the
  // destination was never a field.
  assert.match(prompt, /- default \(mode: targetServer/);
  assert.ok(!/TARGETSERVER_/.test(prompt), 'target server names are not a field of the review context');
});

test('a name colliding with our own section headings does not trip the leak guard', async (t) => {
  // "Execution" appears in a heading this file writes. A TargetServer of that
  // name is perfectly ordinary, and without subtracting our own scaffolding the
  // guard would find it there and abort every review on that proxy claiming a
  // bug in the prompt builder.
  const stub = stubGemini([{ summary: 'fine', findings: [] }]);
  t.after(() => stub.restore());

  const proxy = buildProxy();
  proxy.targets[0].targetServers = ['Execution'];

  const result = await reviewProxy({ proxy });
  assert.equal(result.findings.length, 0);
  assert.equal(result.summary, 'fine');
});

test('the execution order sent is Apigee\'s real order', async (t) => {
  // The whole feature rests on this list: almost every problem a linter cannot
  // catch is a problem of order.
  const stub = stubGemini([GOOD_REVIEW]);
  t.after(() => stub.restore());

  await reviewProxy({ proxy: buildProxy() });

  const prompt = stub.sent[0].body.contents[0].parts[0].text;
  const verify = prompt.indexOf('VK-VerifyKey (VerifyAPIKey)');
  const quota = prompt.indexOf('Q-Monthly (Quota)');
  const cache = prompt.indexOf('RC-Cache (ResponseCache)');

  assert.ok(verify > -1 && quota > -1 && cache > -1, 'every step appears');
  // ProxyEndpoint PreFlow request, then the target's request flow, then the
  // proxy's response flow — which is exactly what makes the quota's position
  // reviewable.
  assert.ok(verify < quota, 'the proxy request flow runs before the target request flow');
  assert.ok(quota < cache, 'the target request flow runs before the proxy response flow');
});

test('unknown severities and categories are clamped rather than passed through', async (t) => {
  const stub = stubGemini([
    {
      summary: 's',
      findings: [
        { ...GOOD_REVIEW.findings[0], severity: 'CATASTROPHIC', category: 'vibes', fixKind: 'magic' },
      ],
    },
  ]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });
  const finding = result.findings[0];

  assert.equal(finding.severity, 'medium');
  assert.equal(finding.category, 'correctness');
  assert.equal(finding.fixKind, 'none');
});

test('findings come back worst first, and capped', async (t) => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...GOOD_REVIEW.findings[0],
    title: `Finding ${i}`,
    severity: i === 19 ? 'high' : 'low',
  }));
  const stub = stubGemini([{ summary: 's', findings: many }]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });

  assert.equal(result.findings.length, 12);
  assert.equal(result.findings[0].title, 'Finding 19', 'the one high-severity finding leads');
});

test('a review with nothing to say is a valid answer', async (t) => {
  const stub = stubGemini([{ summary: 'This proxy looks sound.', findings: [] }]);
  t.after(() => stub.restore());

  const result = await reviewProxy({ proxy: buildProxy() });

  assert.equal(result.findings.length, 0);
  assert.equal(result.dropped, 0);
  assert.equal(result.attempts, 1, 'an empty review is not retried');
  assert.match(result.summary, /sound/);
});

test('the preview shows the real prompt and hides no real values', () => {
  const preview = previewReviewRequest({ proxy: buildProxy() });

  assert.match(preview.systemInstruction, /You review Apigee X API proxy designs/);
  assert.match(preview.prompt, /Execution order/);
  assert.ok(preview.substitutions.length > 0, 'the backend URL was withheld');
  for (const s of preview.substitutions) {
    assert.match(s.placeholder, /^\{\{[A-Z]+_\d+\}\}$/);
    assert.equal(typeof s.characters, 'number');
    // Counts and placeholder names only — the panel itself has to be safe to
    // screenshot.
    assert.ok(!('value' in s));
  }
});
