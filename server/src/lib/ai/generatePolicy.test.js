// Exercises the full generate loop with a stubbed network, so everything except
// Gemini itself is covered without a key or a quota.
//
// The stub replaces global fetch and captures what was sent, which lets the
// leak assertions below inspect the actual bytes that would have gone out
// rather than a reconstruction of them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { generatePolicy } from './generatePolicy.js';
import { activeModel, clearModelCache, listModels, providerInfo, setModel } from './provider.js';

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
    (err) =>
      /busy right now/.test(err.message) &&
      /switch to a lighter model/i.test(err.message) &&
      // The escape hatch the UI turns into a button. It rides on the error
      // rather than in the message, so the advice is actionable from where the
      // user is standing instead of being an instruction to go and edit .env.
      err.fallbackModel === 'gemini-3.1-flash-lite'
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

test('a busy request offers no fallback when it is already on the lighter model', async (t) => {
  // Otherwise the UI shows a button that switches to the model that just
  // failed — worse than no button, because it looks like a way out.
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.GEMINI_MODEL;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ error: { code: 503, message: 'high demand' } }),
  });

  await assert.rejects(
    () => generatePolicy({ proxy: PROXY, intent: 'cache', policyType: 'ResponseCache' }),
    (err) => err.fallbackModel === null && !/switch to a lighter model/i.test(err.message)
  );
});

test('a runtime override changes the model and is reported as an override', async (t) => {
  const originalModel = process.env.GEMINI_MODEL;
  t.after(() => {
    setModel(null);
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  process.env.GEMINI_MODEL = 'gemini-3.6-flash';
  assert.equal(providerInfo().model, 'gemini-3.6-flash');
  assert.equal(providerInfo().source, 'env');

  const applied = setModel('gemini-3.1-flash-lite');
  assert.equal(applied.model, 'gemini-3.1-flash-lite');
  assert.equal(applied.source, 'override', 'the UI labels an override as lasting only until restart');
  assert.equal(activeModel(), 'gemini-3.1-flash-lite');

  // Clearing goes back to .env rather than to the built-in default — the file
  // is still the permanent choice, the override was only ever borrowed.
  assert.equal(setModel(null).model, 'gemini-3.6-flash');
  assert.equal(setModel(null).source, 'env');
});

test('the menu always contains the model it says is active', async (t) => {
  // A model pinned in .env that is none of ours must still appear, or the
  // picker silently omits the very model it is reporting.
  const originalModel = process.env.GEMINI_MODEL;
  t.after(() => {
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  process.env.GEMINI_MODEL = 'gemini-9-experimental';
  const info = providerInfo();
  assert.ok(info.models.some((m) => m.id === info.model));
});

test('a model name that could not be one is refused', () => {
  // The name is interpolated into the request URL, so it is checked rather
  // than trusted — and refusing is a 400, not a silent no-op.
  for (const bad of ['../../etc/passwd', 'model name with spaces', 'a'.repeat(200), 42, {}]) {
    assert.throws(() => setModel(bad), RangeError, `should have refused ${JSON.stringify(bad)}`);
  }
  // A name Google might plausibly return from a 404 is accepted, because the
  // whole point of surfacing that message is that you can act on it.
  assert.equal(setModel('gemini-4.0-flash-preview-11-2026').model, 'gemini-4.0-flash-preview-11-2026');
  setModel(null);
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

test('the model list comes from Google, filtered to what this app can actually use', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  process.env.GEMINI_API_KEY = 'test-key';
  clearModelCache();

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      models: [
        { name: 'models/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.6-pro', displayName: 'Gemini 3.6 Pro', description: 'Our most capable model.', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
        // Everything below must be filtered out. These are real entries from a
        // live ListModels response, not invented ones — a key lists music,
        // image, robotics and agent models in the same array as the text ones.
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-4.0-generate', supportedGenerationMethods: ['predict'] },
        { name: 'models/lyria-3.5', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/nano-banana-pro-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/deep-research-pro-preview-12-2025', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/antigravity-preview-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-robotics-er-2-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-omni-flash-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-transcribe', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-computer-use-preview-10-2025', supportedGenerationMethods: ['generateContent'] },
        // Floating aliases are excluded on purpose: they change model behaviour
        // underneath a prompt tuned against a specific one.
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
      ],
    }),
  });

  const { models, source } = await listModels();
  const ids = models.map((m) => m.id);
  assert.equal(source, 'live');

  // Gemma answers generateContent but rejects responseSchema, which every call
  // in this app uses — offering it would guarantee a failure on every attempt.
  assert.ok(!ids.includes('gemma-3-27b-it'), 'gemma cannot do structured output');
  assert.ok(!ids.includes('gemini-flash-latest'), 'floating aliases are not offered');
  for (const rejected of [
    'text-embedding-004',
    'imagen-4.0-generate',
    'lyria-3.5',
    'nano-banana-pro-preview',
    'deep-research-pro-preview-12-2025',
    'antigravity-preview-latest',
    'gemini-robotics-er-2-preview',
    'gemini-omni-flash-preview',
    'gemini-3.5-transcribe',
    'gemini-3.1-flash-image',
    'gemini-2.5-computer-use-preview-10-2025',
  ]) {
    assert.ok(!ids.includes(rejected), `${rejected} is not a general-purpose text model`);
  }
  assert.ok(ids.includes('gemini-3.6-pro'), 'a model we do not hardcode must still show up');

  // The pair we vouch for comes first, in our order, whatever order Google
  // returned them in — here it listed 3.6-flash, then 3.1-flash-lite third.
  assert.deepEqual(ids.slice(0, 2), ['gemini-3.6-flash', 'gemini-3.1-flash-lite']);
  // …and the rest sort newest-looking first rather than alphabetically.
  assert.deepEqual(ids.slice(2), ['gemini-3.6-pro', 'gemini-2.5-flash']);
  // Our own note wins over Google's description for a curated entry.
  assert.match(models[0].note, /Default\. Best answers/);
});

test('an unreachable model list falls back to the pair we know works', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  process.env.GEMINI_API_KEY = 'test-key';

  // No successful fetch has happened, so there is no cache to fall back on
  // either — this is the cold path, which must still produce a usable menu.
  clearModelCache();
  // Losing the network must not also lose the ability to switch off a busy
  // model — that is the one moment anybody opens this menu.
  globalThis.fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };

  const { models, source } = await listModels();
  assert.equal(source, 'catalog');
  assert.deepEqual(models.map((m) => m.id), ['gemini-3.6-flash', 'gemini-3.1-flash-lite']);
});

test('the model in force is always in the list shown beside it', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  // A model pinned in .env that Google has since retired is exactly the case
  // that produces the 404 this app translates — it must not vanish from the
  // picker while the chip above it still names it.
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'gemini-1.9-retired';
  clearModelCache();
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }],
    }),
  });

  const { models } = await listModels();
  assert.ok(models.some((m) => m.id === 'gemini-1.9-retired'));
});
