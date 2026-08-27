import { Router } from 'express';
import { proxiesStore, sharedFlowsStore } from '../lib/storage.js';
import { normalizeProxy } from '../lib/model.js';
import { normalizeSharedFlow } from '../lib/sharedFlowModel.js';
import { auditWorkspace } from '../lib/workspaceAudit.js';

const router = Router();

// Workspace-wide, so it takes no payload and reads everything off disk itself
// — unlike /bundle/*, which operates on the possibly-unsaved proxy the client
// is holding. That difference is deliberate: this answers "what does my whole
// workspace look like", and the honest answer is the saved state.
router.get('/workspace/audit', async (req, res) => {
  try {
    const [proxies, sharedFlows] = await Promise.all([proxiesStore.list(), sharedFlowsStore.list()]);
    res.json(
      auditWorkspace({
        proxies: proxies.map(normalizeProxy),
        sharedFlows: sharedFlows.map(normalizeSharedFlow),
      })
    );
  } catch (err) {
    res.status(500).json({ error: `Could not audit the workspace: ${err.message}` });
  }
});

export default router;
