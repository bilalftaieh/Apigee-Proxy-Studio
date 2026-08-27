import { Router } from 'express';
import { nanoid } from 'nanoid';
import { templatesStore, proxiesStore } from '../lib/storage.js';
import { BUILT_IN_TEMPLATES } from '../seed/templates.js';
import { cloneProxyFromTemplate } from '../lib/model.js';
import { requireSafeId } from '../lib/validateId.js';

const router = Router();
router.param('id', requireSafeId);

async function findTemplate(id) {
  const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
  if (builtIn) return builtIn;
  return templatesStore.get(id);
}

router.get('/templates', async (req, res) => {
  const userTemplates = await templatesStore.list();
  res.json([...BUILT_IN_TEMPLATES, ...userTemplates]);
});

router.post('/templates', async (req, res) => {
  const { name, description, proxy } = req.body || {};
  if (!name || !proxy) return res.status(400).json({ error: 'name and proxy are required' });
  const template = {
    id: `tpl-${nanoid(10)}`,
    builtIn: false,
    name,
    description: description || '',
    tags: [],
    proxy,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await templatesStore.save(template.id, template);
  res.status(201).json(template);
});

router.delete('/templates/:id', async (req, res) => {
  if (BUILT_IN_TEMPLATES.some((t) => t.id === req.params.id)) {
    return res.status(400).json({ error: 'Built-in templates cannot be deleted.' });
  }
  await templatesStore.remove(req.params.id);
  res.status(204).end();
});

router.post('/templates/:id/use', async (req, res) => {
  const template = await findTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const { name, basePath } = req.body || {};
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return res.status(400).json({ error: 'Proxy name must be alphanumeric (., _, - allowed).' });
  }
  const proxy = cloneProxyFromTemplate(template, { name, basePath });
  await proxiesStore.save(proxy.id, proxy);
  res.status(201).json(proxy);
});

export default router;
