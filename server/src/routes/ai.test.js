// Route-level tests for the AI endpoints.
//
// These run against a real Express app over a real socket rather than by
// calling the handlers directly, because what is being tested IS the route
// boundary: what a caller can put in a request body, and what the server
// refuses to take its word for.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A throwaway data directory, pointed at BEFORE storage.js is evaluated.
//
// The two imports below are dynamic for exactly that reason: a static `import`
// is hoisted and runs before any of this module's own statements, so storage.js
// would already have resolved DATA_DIR to the real one. These tests write and
// delete proxies, and they have no business doing that in the workspace someone
// is actually using.
const DATA_DIR = await mkdtemp(join(tmpdir(), 'apigee-studio-test-'));
process.env.APIGEE_STUDIO_DATA_DIR = DATA_DIR;

const { proxiesStore } = await import('../lib/storage.js');
const { default: aiRouter } = await import('./ai.js');

after(() => rm(DATA_DIR, { recursive: true, force: true }));

async function withServer(run) {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api', aiRouter);

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(base, path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('the AI opt-out is read from the saved proxy, not from the request body', async () => {
  const id = 'saved-and-opted-out';
  await proxiesStore.save(id, { id, name: 'opted-out', basePath: '/v1', aiDisabled: true, policies: [] });

  await withServer(async (base) => {
    for (const path of ['/ai/preview', '/ai/policy']) {
      // A stale tab or a hand-rolled request sends the flag as false — or omits
      // it entirely. Neither may be enough to turn the feature back on.
      const res = await post(base, path, {
        intent: 'cache responses',
        proxy: { id, name: 'opted-out', basePath: '/v1', policies: [], aiDisabled: false },
      });
      assert.equal(res.status, 403, `${path} must refuse an opted-out proxy`);
      assert.match((await res.json()).error, /turned off/);
    }
  });
});

test('an unsaved workspace can still opt itself out', async () => {
  // Nothing on disk to consult, so the body is all there is — and the flag only
  // ever restricts, so it is honoured.
  await withServer(async (base) => {
    const res = await post(base, '/ai/policy', {
      intent: 'cache responses',
      proxy: { id: 'never-saved-anywhere', policies: [], aiDisabled: true },
    });
    assert.equal(res.status, 403);
  });
});

test('a proxy id cannot be used to read outside the store', async () => {
  await withServer(async (base) => {
    // The id is joined into a file path by the store and, unlike a route param,
    // has not been through requireSafeId. A traversal attempt must not throw or
    // resolve — it is simply not a usable id, so the request proceeds on the
    // body alone and fails on configuration instead.
    const res = await post(base, '/ai/policy', {
      intent: 'cache responses',
      proxy: { id: '../../../../etc/passwd', policies: [] },
    });
    assert.notEqual(res.status, 500);
  });
});

test('both endpoints enforce the same intent limits', async () => {
  await withServer(async (base) => {
    for (const path of ['/ai/preview', '/ai/policy']) {
      const blank = await post(base, path, { intent: '   ', proxy: null });
      assert.equal(blank.status, 400, `${path} must reject a blank intent`);

      // /ai/preview used to have no cap at all, which made it the cheaper way
      // to hand the server an unbounded string.
      const long = await post(base, path, { intent: 'x'.repeat(2001), proxy: null });
      assert.equal(long.status, 400, `${path} must reject an over-long intent`);
      assert.match((await long.json()).error, /too long/);
    }
  });
});

// --- /ai/fix ---------------------------------------------------------------

const FIXABLE_PROXY = {
  id: 'fixable-proxy',
  name: 'fixable',
  basePath: '/v1',
  policies: [
    {
      id: 'p1',
      name: 'RC-Cache',
      type: 'ResponseCache',
      xml: '<ResponseCache name="RC-Cache"><CacheKey><Prefix>{PROJECT_ID}</Prefix></CacheKey></ResponseCache>',
    },
  ],
};

const FIXABLE_FINDING = {
  filePath: 'apiproxy/policies/RC-Cache.xml',
  ruleId: 'DEPLOY005',
  message: 'Policy "RC-Cache" still contains template placeholders: {PROJECT_ID}.',
  severity: 'error',
};

test('the AI opt-out covers the fix endpoints too', async () => {
  const id = 'fix-opted-out';
  await proxiesStore.save(id, { ...FIXABLE_PROXY, id, aiDisabled: true });

  await withServer(async (base) => {
    for (const path of ['/ai/fix/preview', '/ai/fix']) {
      const res = await post(base, path, {
        proxy: { ...FIXABLE_PROXY, id, aiDisabled: false },
        finding: FIXABLE_FINDING,
      });
      assert.equal(res.status, 403, `${path} must refuse an opted-out proxy`);
      assert.match((await res.json()).error, /turned off/);
    }
  });
});

test('a finding that is not about a policy file is refused, not guessed at', async () => {
  // An empty base path or a route rule with no target is an edit to the proxy
  // model, not to any one XML document. There is nothing for the fixer to
  // rewrite, and picking a policy to rewrite anyway would be the worst
  // available answer.
  await withServer(async (base) => {
    for (const filePath of ['apiproxy/proxies/default.xml', 'apiproxy/policies/NotHere.xml']) {
      const res = await post(base, '/ai/fix', {
        proxy: FIXABLE_PROXY,
        finding: { ...FIXABLE_FINDING, filePath },
      });
      assert.equal(res.status, 400, `${filePath} must not resolve to a policy`);
      assert.match((await res.json()).error, /not about a policy in this proxy/);
    }
  });
});

test('both fix endpoints enforce the same finding limits', async () => {
  await withServer(async (base) => {
    for (const path of ['/ai/fix/preview', '/ai/fix']) {
      const blank = await post(base, path, { proxy: FIXABLE_PROXY, finding: { ...FIXABLE_FINDING, message: '  ' } });
      assert.equal(blank.status, 400, `${path} must reject a blank finding`);

      const long = await post(base, path, {
        proxy: FIXABLE_PROXY,
        finding: { ...FIXABLE_FINDING, message: 'x'.repeat(4001) },
      });
      assert.equal(long.status, 400, `${path} must reject an over-long finding`);
      assert.match((await long.json()).error, /too long/);

      const noProxy = await post(base, path, { finding: FIXABLE_FINDING });
      assert.equal(noProxy.status, 400, `${path} must reject a request with no proxy`);
    }
  });
});

// --- /ai/review ------------------------------------------------------------

test('the AI opt-out covers the review endpoints too', async () => {
  const id = 'review-opted-out';
  await proxiesStore.save(id, { ...FIXABLE_PROXY, id, aiDisabled: true });

  await withServer(async (base) => {
    for (const path of ['/ai/review/preview', '/ai/review']) {
      const res = await post(base, path, { proxy: { ...FIXABLE_PROXY, id, aiDisabled: false } });
      assert.equal(res.status, 403, `${path} must refuse an opted-out proxy`);
      assert.match((await res.json()).error, /turned off/);
    }
  });
});

test('both review endpoints need a proxy', async () => {
  await withServer(async (base) => {
    for (const path of ['/ai/review/preview', '/ai/review']) {
      const res = await post(base, path, {});
      assert.equal(res.status, 400, `${path} must reject a request with no proxy`);
      assert.match((await res.json()).error, /proxy is required/);
    }
  });
});
