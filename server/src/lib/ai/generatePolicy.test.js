// Exercises the full generate loop with a stubbed network, so everything except
// Gemini itself is covered without a key or a quota.
//
// The stub replaces global fetch and captures what was sent, which lets the
// leak assertions below inspect the actual bytes that would have gone out
// rather than a reconstruction of them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { generatePolicy } from './generatePolicy.js';

const PROXY = {
  name: 'acme-payments',
  basePath: '/v1/payments',
  targets: [
    {
      url: { mode: 'literal', value: 'https://api.acmebank.internal/v1' },
      targetServers: ['ts-payments-prod-01'],
    },
  ],
  policies: [],
};

function geminiReply(object) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(object) }] } }],
    }),
  };
}

/** Swaps in a fake Gemini that returns each queued object in turn. */
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

const VALID_CACHE_POLICY = {
  policyName: 'RC-CacheTokens',
  displayName: 'Cache token responses',
  elements: [
    {
      name: 'ExpirySettings',
      children: [{ name: 'TimeoutInSeconds', text: '300' }],
    },
    { name: 'CacheKey', children: [{ name: 'KeyFragment', attributes: [{ name: 'ref', value: 'request.uri' }] }] },
  ],
  notes: 'Caches responses for five minutes.',
};

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-not-real';
});

test('generates valid policy XML end to end', async (t) => {
  const stub = stubGemini([VALID_CACHE_POLICY]);
  t.after(() => stub.restore());

  const result = await generatePolicy({
    proxy: PROXY,
    intent: 'cache token responses for 5 minutes',
    policyType: 'ResponseCache',
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.policyType, 'ResponseCache');
  assert.match(result.xml, /^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>/);
  assert.match(result.xml, /<ResponseCache name="RC-CacheTokens">/);
  assert.match(result.xml, /<TimeoutInSeconds>300<\/TimeoutInSeconds>/);
});

test('nothing sensitive reaches the wire', async (t) => {
  const stub = stubGemini([VALID_CACHE_POLICY]);
  t.after(() => stub.restore());

  await generatePolicy({
    proxy: PROXY,
    // The user naming their own backend in the prompt is the likeliest leak.
    intent: 'cache responses from https://api.acmebank.internal/v1 via ts-payments-prod-01',
    policyType: 'ResponseCache',
  });

  const wire = stub.sent[0].raw;
  for (const secret of ['acmebank', 'ts-payments-prod-01', 'acme-payments', '/v1/payments']) {
    assert.ok(!wire.includes(secret), `"${secret}" must not appear in the request body`);
  }
  assert.match(wire, /\{\{URL_1\}\}/);
});

test('placeholders in the model output are restored to real values', async (t) => {
  // A plausible model response: it echoed the placeholder it was given into a
  // KeyFragment, exactly as instructed.
  const stub = stubGemini([
    {
      policyName: 'RC-Echo',
      elements: [{ name: 'CacheKey', children: [{ name: 'Prefix', text: '{{URL_1}}' }] }],
      notes: 'Keyed on {{URL_1}}.',
    },
  ]);
  t.after(() => stub.restore());

  const result = await generatePolicy({
    proxy: PROXY,
    intent: 'cache per backend https://api.acmebank.internal/v1',
    policyType: 'ResponseCache',
  });

  assert.match(result.xml, /<Prefix>https:\/\/api\.acmebank\.internal\/v1<\/Prefix>/);
  assert.match(result.notes, /api\.acmebank\.internal/);
});

test('retries once when the model invents an element, and recovers', async (t) => {
  const stub = stubGemini([
    {
      policyName: 'RC-Bad',
      elements: [{ name: 'TotallyMadeUpElement', text: 'nope' }],
      notes: 'first try',
    },
    VALID_CACHE_POLICY,
  ]);
  t.after(() => stub.restore());

  const result = await generatePolicy({
    proxy: PROXY,
    intent: 'cache things',
    policyType: 'ResponseCache',
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(stub.sent.length, 2);
  // The second prompt has to actually tell the model what was wrong, or the
  // retry is just a reroll.
  const retryPrompt = stub.sent[1].body.contents[0].parts[0].text;
  assert.match(retryPrompt, /rejected by the validator/);
  assert.match(retryPrompt, /TotallyMadeUpElement/);
});

test('returns the draft flagged when both attempts fail', async (t) => {
  const bad = { policyName: 'RC-Bad', elements: [{ name: 'StillNotReal', text: 'x' }], notes: 'n' };
  const stub = stubGemini([bad, bad]);
  t.after(() => stub.restore());

  const result = await generatePolicy({ proxy: PROXY, intent: 'cache things', policyType: 'ResponseCache' });

  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
  assert.ok(result.warnings.length > 0);
  assert.match(result.warnings[0], /StillNotReal/);
  // The draft still comes back — it is more useful to edit than an error is.
  assert.match(result.xml, /<ResponseCache/);
});

test('lets the model pick the policy type when none is given', async (t) => {
  const stub = stubGemini([{ ...VALID_CACHE_POLICY, policyType: 'ResponseCache' }]);
  t.after(() => stub.restore());

  const result = await generatePolicy({ proxy: PROXY, intent: 'cache responses' });

  assert.equal(result.ok, true);
  assert.equal(result.policyType, 'ResponseCache');
  // The catalogue has to be in the prompt for the choice to be grounded.
  const prompt = stub.sent[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Choose the single best policy type/);
  assert.match(prompt, /SpikeArrest/);
});

test('sends the API key as a header, never in the URL', async (t) => {
  const stub = stubGemini([VALID_CACHE_POLICY]);
  t.after(() => stub.restore());

  await generatePolicy({ proxy: PROXY, intent: 'cache', policyType: 'ResponseCache' });

  assert.ok(!stub.sent[0].url.includes('test-key-not-real'), 'key must not be a query parameter');
});

test('a retry in choose-the-type mode is re-briefed with the chosen grammar', async (t) => {
  // The first prompt deliberately carries the catalogue and NO grammar — which
  // grammar applies is the question the model is answering. The validator then
  // judges the answer against the chosen type's grammar, so the retry has to be
  // shown the same thing the validator is reading. Without that, the retry was
  // told to "use only elements from the grammar above" with no grammar above,
  // and reliably reproduced the element that had just been rejected.
  const stub = stubGemini([
    { policyType: 'ResponseCache', policyName: 'RC-A', elements: [{ name: 'TotallyMadeUpElement', text: 'x' }], notes: 'n' },
    VALID_CACHE_POLICY,
  ]);
  t.after(() => stub.restore());

  const result = await generatePolicy({ proxy: PROXY, intent: 'cache responses' });

  const first = stub.sent[0].body;
  const second = stub.sent[1].body;
  const firstPrompt = first.contents[0].parts[0].text;
  const secondPrompt = second.contents[0].parts[0].text;

  assert.match(firstPrompt, /Choose the single best policy type/);
  assert.ok(!/Grammar for/.test(firstPrompt), 'the first attempt has no type to have a grammar for');

  assert.match(secondPrompt, /Grammar for <ResponseCache>/);
  assert.match(secondPrompt, /ExpirySettings/);
  assert.match(secondPrompt, /TotallyMadeUpElement/);

  // The type is settled, so the retry stops asking for it — the model cannot
  // wander to a different type than the grammar it was just handed.
  assert.ok(
    !('policyType' in second.generationConfig.responseSchema.properties),
    'the retry schema should not re-open the type choice'
  );

  assert.equal(result.ok, true);
  assert.equal(result.policyType, 'ResponseCache');
  assert.equal(result.attempts, 2);
});

test('an Apigee element name reused as a TargetServer does not block generation', async (t) => {
  const stub = stubGemini([{ policyName: 'SC-Call', elements: [{ name: 'Request' }], notes: 'n' }]);
  t.after(() => stub.restore());

  const proxy = { targets: [{ targetServers: [{ name: 'Authentication' }] }], policies: [] };
  const result = await generatePolicy({ proxy, intent: 'call the backend', policyType: 'ServiceCallout' });

  assert.equal(result.ok, true);
  // The name still never travels as the user's data — it appears only inside
  // the grammar we ourselves supplied.
  const promptSent = stub.sent[0].body.contents[0].parts[0].text;
  assert.ok(!/Request: .*Authentication/.test(promptSent), 'not present as workspace data');
});

test('a name that cannot be written as XML is dropped and reported', async (t) => {
  // Element and attribute VALUES are escaped, but a NAME goes into tag position
  // raw. `<Assign Message>` is not a document any parser should accept, and the
  // schema the model decodes against cannot enforce that a string is a legal
  // XML name.
  const bad = {
    policyName: 'RC-Bad',
    elements: [{ name: 'Assign Message', text: 'x' }, { name: 'ExpirySettings', children: [{ name: 'TimeoutInSeconds', text: '60' }] }],
    notes: 'n',
  };
  const stub = stubGemini([bad, bad]);
  t.after(() => stub.restore());

  const result = await generatePolicy({ proxy: PROXY, intent: 'cache things', policyType: 'ResponseCache' });

  // Well-formed whatever the model did: the bad name never reaches the output.
  assert.ok(!result.xml.includes('Assign Message'), 'the unwritable name is not emitted');
  assert.match(result.xml, /<TimeoutInSeconds>60<\/TimeoutInSeconds>/);

  // ...and the user is told, rather than handed a policy quietly missing a
  // piece. The retry is told too.
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((w) => w.includes('Assign Message')), 'reported in warnings');
  assert.match(stub.sent[1].body.contents[0].parts[0].text, /Assign Message/);
});

test('retries once through a transient 503, then succeeds', async (t) => {
  // Google returns 503 "high demand" on the free tier routinely; it is
  // explicitly temporary, so a user should not have to see it for a blip.
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { code: 503, message: 'high demand' } }),
      };
    }
    return geminiReply(VALID_CACHE_POLICY);
  };

  const result = await generatePolicy({ proxy: PROXY, intent: 'cache', policyType: 'ResponseCache' });

  assert.equal(result.ok, true);
  assert.equal(calls, 2, 'should have retried the overloaded request exactly once');
});

test('gives up on a persistent 503 with an actionable message', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: { code: 503, message: 'high demand' } }),
    };
  };

  await assert.rejects(
    () => generatePolicy({ proxy: PROXY, intent: 'cache', policyType: 'ResponseCache' }),
    (err) => /busy right now/.test(err.message) && /GEMINI_MODEL/.test(err.message)
  );
  assert.equal(calls, 2, 'one original attempt plus one retry, then stop');
});

test('a retired model name surfaces the successor Google names', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    text: async () =>
      JSON.stringify({
        error: {
          code: 404,
          message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features.',
        },
      }),
  });

  await assert.rejects(
    () => generatePolicy({ proxy: PROXY, intent: 'cache', policyType: 'ResponseCache' }),
    (err) => /GEMINI_MODEL=gemini-3\.6-flash/.test(err.message)
  );
});

test('reads the answer past a reasoning part from a thinking model', async (t) => {
  // The default model is a thinking model. Today it returns a single part with
  // the reasoning attached as a sibling key, but these models can also emit a
  // separate reasoning part first — indexing parts[0] blindly would read that
  // as an empty response.
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: 'Let me think about which elements apply...' },
              { text: JSON.stringify(VALID_CACHE_POLICY), thoughtSignature: 'abc123' },
            ],
          },
        },
      ],
    }),
  });

  const result = await generatePolicy({ proxy: PROXY, intent: 'cache', policyType: 'ResponseCache' });

  assert.equal(result.ok, true);
  assert.equal(result.name, 'RC-CacheTokens');
});
