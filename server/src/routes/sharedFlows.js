import { Router } from 'express';
import { sharedFlowsStore } from '../lib/storage.js';
import { createBlankSharedFlow, duplicateSharedFlow, normalizeSharedFlow } from '../lib/sharedFlowModel.js';
import { requireSafeId } from '../lib/validateId.js';

const router = Router();
router.param('id', requireSafeId);

router.get('/sharedflows', async (req, res) => {
  const items = await sharedFlowsStore.list();
  res.json(
    items.map(({ id, name, description, updatedAt, createdAt, policies, steps }) => ({
      id,
      name,
      description,
      updatedAt,
      createdAt,
      policyCount: policies?.length || 0,
      stepCount: steps?.length || 0,
    }))
  );
});

router.get('/sharedflows/:id', async (req, res) => {
  const sharedFlow = await sharedFlowsStore.get(req.params.id);
  if (!sharedFlow) return res.status(404).json({ error: 'Shared flow not found' });
  res.json(normalizeSharedFlow(sharedFlow));
});

router.post('/sharedflows', async (req, res) => {
  const { name, description } = req.body || {};
  // Same A-Za-z0-9_- restriction Apigee applies to API proxy names.
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Shared flow name may only contain letters, numbers, underscores and hyphens.' });
  }
  const sharedFlow = createBlankSharedFlow({ name, description });
  await sharedFlowsStore.save(sharedFlow.id, sharedFlow);
  res.status(201).json(sharedFlow);
});

router.put('/sharedflows/:id', async (req, res) => {
  const existing = await sharedFlowsStore.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Shared flow not found' });
  const updated = normalizeSharedFlow({ ...existing, ...req.body, id: existing.id, updatedAt: Date.now() });
  await sharedFlowsStore.save(existing.id, updated);
  res.json(updated);
});

router.delete('/sharedflows/:id', async (req, res) => {
  await sharedFlowsStore.remove(req.params.id);
  res.status(204).end();
});

router.post('/sharedflows/:id/duplicate', async (req, res) => {
  const existing = await sharedFlowsStore.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Shared flow not found' });
  const all = await sharedFlowsStore.list();
  const duplicated = duplicateSharedFlow(existing, all.map((s) => s.name));
  await sharedFlowsStore.save(duplicated.id, duplicated);
  res.status(201).json(duplicated);
});

export default router;
