import { Router } from 'express';
import { runProxyTest } from '../lib/testRunner.js';
import { generateNegativeTests } from '../lib/testGenerator.js';
import { applyEnvironmentOverrides, normalizeProxy } from '../lib/model.js';

const router = Router();

// Runs `test` against whatever proxy state the client posts — same
// even-unsaved-edits model as /bundle/lint and /bundle/preview, so trying a
// request doesn't require saving first.
router.post('/bundle/test-run', async (req, res) => {
  const proxy = applyEnvironmentOverrides(normalizeProxy(req.body?.proxy), req.body?.environmentId);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });
  const test = req.body?.test;
  if (!test?.request) return res.status(400).json({ error: 'test.request is required' });

  try {
    const result = runProxyTest(proxy, test);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Derives failure-path test cases from this proxy's FlowContracts and
// actually-attached policies — doesn't save anything server-side, same as
// /bundle/preview; the store appends the results and marks the proxy dirty.
router.post('/bundle/generate-tests', (req, res) => {
  const proxy = normalizeProxy(req.body?.proxy);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });
  try {
    res.json({ tests: generateNegativeTests(proxy) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
