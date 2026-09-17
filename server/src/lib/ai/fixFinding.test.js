// Exercises the full fix loop with a stubbed network, so everything except
// Gemini itself is covered without a key or a quota.
//
// Findings are not hand-written here. They are taken from collectDeployBlockers
// over the same proxy the fix runs against, because the whole point of the
// feature is that the thing being fixed and the thing being re-checked are the
// same deterministic finding — a test that invented its own message would pass
// while the two halves disagreed in production.

import test from 'node:test';
import assert from 'node:assert/strict';

import { collectDeployBlockers } from '../deployChecks.js';
import { fixFinding } from './fixFinding.js';
import { policyNameFromFilePath, resolveFixTarget } from './fixTarget.js';

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

/** A proxy whose one policy carries an unreplaced {PROJECT_ID} token. */
function proxyWithPlaceholder(prefixText = '{PROJECT_ID}') {
  const policy = {
    id: 'policy-1',
    name: 'RC-CacheTokens',
    type: 'ResponseCache',
    xml: `<ResponseCache name="RC-CacheTokens">\n    <CacheKey>\n        <Prefix>${prefixText}</Prefix>\n    </CacheKey>\n</ResponseCache>\n`,
  };
  return {
    name: 'acme-payments',
    basePath: '/v1/payments',
    targets: [
      {
        name: 'default',
        url: { mode: 'literal', value: 'https://api.acmebank.internal/v1' },
        targetServers: ['ts-payments-prod-01'],
      },
    ],
    policies: [policy],
  };
}

/** The real DEPLOY005 finding this proxy produces, whatever its wording is. */
function placeholderFinding(proxy) {
  const finding = collectDeployBlockers(proxy).find((p) => p.ruleId === 'DEPLOY005');
  assert.ok(finding, 'the fixture should produce a placeholder blocker to fix');
  return finding;
}

const FIXED_PREFIX = (text) => ({
  elements: [{ name: 'CacheKey', children: [{ name: 'Prefix', text }] }],
  notes: 'Replaced the placeholder with a literal prefix.',
});

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-not-real';
});

test('fixes the reported problem and verifies that it is actually gone', async (t) => {
  const stub = stubGemini([FIXED_PREFIX('acme-payments')]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder();
  const policy = proxy.policies[0];
  const result = await fixFinding({ proxy, policy, finding: placeholderFinding(proxy) });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.match(result.xml, /<Prefix>acme-payments<\/Prefix>/);
  assert.ok(!result.xml.includes('{PROJECT_ID}'));

  // The claim that it worked is ours, not the model's.
  assert.equal(result.verification.recheckable, true);
  assert.equal(result.verification.resolved, true);
  assert.deepEqual(result.verification.newProblems, []);

  // The original travels back with it so the UI can diff rather than describe.
  assert.equal(result.original, policy.xml);
  assert.equal(result.policyId, 'policy-1');
});

test('the policy keeps its name even when the model tries to rename it', async (t) => {
  // A renamed policy is a dangling Step reference in every flow that used it —
  // a worse break than the one being repaired, and one the model has no way to
  // know about, since it is never shown the flows.
  const stub = stubGemini([{ ...FIXED_PREFIX('acme'), policyName: 'RC-SomethingElse' }]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder();
  const result = await fixFinding({ proxy, policy: proxy.policies[0], finding: placeholderFinding(proxy) });

  assert.equal(result.ok, true);
  assert.match(result.xml, /<ResponseCache name="RC-CacheTokens">/);
  assert.ok(!result.xml.includes('RC-SomethingElse'));
  assert.equal(result.policyName, 'RC-CacheTokens');
});

test('retries when the answer validates but does not resolve the finding', async (t) => {
  const stub = stubGemini([FIXED_PREFIX('{PROJECT_ID}'), FIXED_PREFIX('acme')]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder();
  const result = await fixFinding({ proxy, policy: proxy.policies[0], finding: placeholderFinding(proxy) });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.verification.resolved, true);

  // Valid XML both times — without the second check this would have been
  // accepted on the first attempt with the problem still in it.
  const retryPrompt = stub.sent[1].body.contents[0].parts[0].text;
  assert.match(retryPrompt, /still present after your change/);
});

test('a fix that trades one blocker for another is rejected and reported', async (t) => {
  const swap = FIXED_PREFIX('{OTHER_TOKEN}');
  const stub = stubGemini([swap, swap]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder();
  const result = await fixFinding({ proxy, policy: proxy.policies[0], finding: placeholderFinding(proxy) });

  // The original finding did go away, so a check that only looked for that
  // would have called this a success.
  assert.equal(result.ok, false);
  assert.ok(
    result.warnings.some((w) => /introduced a new problem/.test(w)),
    'the swap has to be reported'
  );
  assert.ok(result.verification.newProblems.some((p) => p.includes('{OTHER_TOKEN}')));

  // Told to the model too, or the retry is just a reroll.
  assert.match(stub.sent[1].body.contents[0].parts[0].text, /introduced a new problem/);
});

test('nothing sensitive reaches the wire', async (t) => {
  const stub = stubGemini([FIXED_PREFIX('acme')]);
  t.after(() => stub.restore());

  // The backend URL is inside the policy XML, which — unlike the generation
  // path — is sent. This is the exposure the feature adds, so it is the one
  // worth pinning down.
  const proxy = proxyWithPlaceholder();
  proxy.policies[0].xml = proxy.policies[0].xml.replace(
    '{PROJECT_ID}',
    '{PROJECT_ID}-https://api.acmebank.internal/v1'
  );

  await fixFinding({ proxy, policy: proxy.policies[0], finding: placeholderFinding(proxy) });

  const wire = stub.sent[0].raw;
  for (const secret of ['acmebank', 'ts-payments-prod-01', 'acme-payments', '/v1/payments']) {
    assert.ok(!wire.includes(secret), `"${secret}" must not appear in the request body`);
  }
  assert.match(wire, /\{\{URL_1\}\}/);
});

test('a placeholder standing in for a redacted value is not read back as a template token', async (t) => {
  // {{URL_1}} contains {URL_1}, which is exactly the shape DEPLOY005 hunts for.
  // Verifying before restoring real values would report the redaction itself as
  // a brand new blocker on every single fix.
  const stub = stubGemini([FIXED_PREFIX('{{URL_1}}')]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder();
  const result = await fixFinding({ proxy, policy: proxy.policies[0], finding: placeholderFinding(proxy) });

  assert.equal(result.ok, true);
  assert.match(result.xml, /<Prefix>https:\/\/api\.acmebank\.internal\/v1<\/Prefix>/);
  assert.deepEqual(result.verification.newProblems, []);
});

test('an apigeelint finding is not claimed to be verified', async (t) => {
  const stub = stubGemini([FIXED_PREFIX('acme')]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder('no-placeholder-here');
  const result = await fixFinding({
    proxy,
    policy: proxy.policies[0],
    finding: {
      filePath: 'apiproxy/policies/RC-CacheTokens.xml',
      ruleId: 'PO013',
      message: 'The CacheKey should include a unique fragment.',
      severity: 'warning',
    },
  });

  assert.equal(result.ok, true);
  // Re-running apigeelint costs a subprocess and up to 30 seconds, so this one
  // is honestly reported as unchecked rather than optimistically as fixed.
  assert.equal(result.verification.recheckable, false);
  assert.equal(result.verification.resolved, null);
  // The cheap half of the check still runs: it can say nothing else broke.
  assert.deepEqual(result.verification.newProblems, []);
});

test('a finding invented by the caller cannot claim to have been resolved', async (t) => {
  const stub = stubGemini([FIXED_PREFIX('acme')]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder('no-placeholder-here');
  const result = await fixFinding({
    proxy,
    policy: proxy.policies[0],
    finding: {
      filePath: 'apiproxy/policies/RC-CacheTokens.xml',
      ruleId: 'DEPLOY005',
      message: 'Something that was never wrong with this proxy.',
      severity: 'error',
    },
  });

  // The rule id looks re-checkable, but the finding was not in the real set
  // before the edit, so nothing can be concluded from its absence after.
  assert.equal(result.verification.recheckable, false);
  assert.equal(result.verification.resolved, null);
});

test('only findings about a policy file are fixable', () => {
  const proxy = proxyWithPlaceholder();

  assert.equal(policyNameFromFilePath('apiproxy/policies/RC-CacheTokens.xml'), 'RC-CacheTokens');
  assert.equal(policyNameFromFilePath('apiproxy/proxies/default.xml'), null);
  assert.equal(policyNameFromFilePath('apiproxy/targets/default.xml'), null);

  assert.equal(resolveFixTarget(proxy, { filePath: 'apiproxy/policies/RC-CacheTokens.xml' })?.id, 'policy-1');
  // Names a policy file, but not one that exists here.
  assert.equal(resolveFixTarget(proxy, { filePath: 'apiproxy/policies/Gone.xml' }), null);
  assert.equal(resolveFixTarget(proxy, { filePath: 'apiproxy/proxies/default.xml' }), null);

  // Names a policy file, but the remedy is a Step in a flow. Rewriting the XML
  // can never resolve it, so it is not offered — the model would come back with
  // the policy unchanged, correctly, having cost a request to say so.
  for (const ruleId of ['DEPLOY007', 'BN005']) {
    assert.equal(
      resolveFixTarget(proxy, { filePath: 'apiproxy/policies/RC-CacheTokens.xml', ruleId }),
      null,
      `${ruleId} is not fixable by editing the policy`
    );
  }
});

test('a policy the model chose not to change is reported as unchanged', async (t) => {
  // The system instruction tells it to leave the policy alone rather than
  // invent a value it cannot know, and it does — a good answer that would read
  // as a broken feature if it arrived behind an Apply button with an empty diff.
  const stub = stubGemini([
    {
      elements: [{ name: 'CacheKey', children: [{ name: 'Prefix', text: 'no-placeholder-here' }] }],
      notes: 'The project id has to come from somewhere outside this policy.',
    },
  ]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder('no-placeholder-here');
  const result = await fixFinding({
    proxy,
    policy: proxy.policies[0],
    finding: {
      filePath: 'apiproxy/policies/RC-CacheTokens.xml',
      ruleId: 'PO013',
      message: 'The CacheKey should include a unique fragment.',
      severity: 'warning',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
});

test('a real change is not reported as unchanged despite reformatting', async (t) => {
  // The proposal goes through the renderer and the original did not, so the two
  // differ in indentation on XML that is otherwise identical — compared as text
  // this would call every fix a change, which is the same lie in reverse.
  const stub = stubGemini([FIXED_PREFIX('acme-payments')]);
  t.after(() => stub.restore());

  const proxy = proxyWithPlaceholder();
  const result = await fixFinding({ proxy, policy: proxy.policies[0], finding: placeholderFinding(proxy) });

  assert.equal(result.unchanged, false);
});
