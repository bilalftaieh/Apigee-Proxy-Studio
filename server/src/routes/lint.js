import { Router } from 'express';
import { lintProxy } from '../lib/lint.js';
import { applyEnvironmentOverrides, normalizeProxy } from '../lib/model.js';
import { sharedFlowsStore } from '../lib/storage.js';

const router = Router();

router.post('/bundle/lint', async (req, res) => {
  const proxy = applyEnvironmentOverrides(normalizeProxy(req.body?.proxy), req.body?.environmentId);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });
  try {
    const sharedFlows = await sharedFlowsStore.list();
    const result = await lintProxy(proxy, { knownSharedFlows: sharedFlows.map((s) => s.name) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
