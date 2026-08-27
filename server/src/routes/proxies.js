import { Router } from 'express';
import { nanoid } from 'nanoid';
import { proxiesStore, historyStore } from '../lib/storage.js';
import { createBlankProxy, duplicateProxy, normalizeProxy } from '../lib/model.js';
import { requireSafeId } from '../lib/validateId.js';

const router = Router();
router.param('id', requireSafeId);
router.param('snapshotId', requireSafeId);

router.get('/proxies', async (req, res) => {
  const items = await proxiesStore.list();
  res.json(
    items.map(({ id, name, basePath, description, updatedAt, createdAt, policies, flows }) => ({
      id,
      name,
      basePath,
      description,
      updatedAt,
      createdAt,
      policyCount: policies?.length || 0,
      flowCount: flows?.length || 0,
    }))
  );
});

router.get('/proxies/:id', async (req, res) => {
  const proxy = await proxiesStore.get(req.params.id);
  if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
  res.json(normalizeProxy(proxy));
});

router.post('/proxies', async (req, res) => {
  const { name, basePath, description } = req.body || {};
  // Apigee restricts API proxy names to A-Za-z0-9_- — note that a dot is NOT
  // allowed, even though it is in a *policy* name. Accepting one here would
  // let a proxy save fine locally and then fail at import.
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Proxy name may only contain letters, numbers, underscores and hyphens.' });
  }
  const proxy = createBlankProxy({ name, basePath, description });
  await proxiesStore.save(proxy.id, proxy);
  res.status(201).json(proxy);
});

router.put('/proxies/:id', async (req, res) => {
  const existing = await proxiesStore.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Proxy not found' });
  // Snapshot the pre-save state before overwriting, so it can be restored later.
  await historyStore.save(existing.id, { id: nanoid(10), savedAt: Date.now(), proxy: existing });
  const updated = normalizeProxy({ ...existing, ...req.body, id: existing.id, updatedAt: Date.now() });
  await proxiesStore.save(existing.id, updated);
  res.json(updated);
});

router.delete('/proxies/:id', async (req, res) => {
  await proxiesStore.remove(req.params.id);
  await historyStore.removeAll(req.params.id);
  res.status(204).end();
});

router.post('/proxies/:id/duplicate', async (req, res) => {
  const existing = await proxiesStore.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Proxy not found' });
  const all = await proxiesStore.list();
  const duplicated = duplicateProxy(existing, all.map((p) => p.name));
  await proxiesStore.save(duplicated.id, duplicated);
  res.status(201).json(duplicated);
});

router.get('/proxies/:id/history', async (req, res) => {
  const items = await historyStore.list(req.params.id);
  res.json(
    items.map(({ id, savedAt, proxy }) => ({
      id,
      savedAt,
      name: proxy.name,
      basePath: proxy.basePath,
      policyCount: proxy.policies?.length || 0,
      flowCount: proxy.flows?.length || 0,
    }))
  );
});

router.post('/proxies/:id/history/:snapshotId/restore', async (req, res) => {
  const current = await proxiesStore.get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Proxy not found' });
  const snapshot = await historyStore.get(req.params.id, req.params.snapshotId);
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

  // Snapshot current state first, so a restore is itself undoable.
  await historyStore.save(current.id, { id: nanoid(10), savedAt: Date.now(), proxy: current });
  const restored = normalizeProxy({ ...snapshot.proxy, id: current.id, updatedAt: Date.now() });
  await proxiesStore.save(current.id, restored);
  res.json(restored);
});

export default router;
