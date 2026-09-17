import { Router } from 'express';
import express from 'express';
import { importProxyZip } from '../lib/bundleImporter.js';
import { parseCurlToProxy } from '../lib/curlImporter.js';
import { parseOpenApiToProxy } from '../lib/openApiImporter.js';
import { parsePostmanToProxy } from '../lib/postmanImporter.js';
import { parseWsdlToProxy } from '../lib/wsdlImporter.js';
import { proxiesStore } from '../lib/storage.js';
import { uniqueName } from '../lib/uniqueName.js';
import { createLogger } from '../lib/log/logger.js';

const router = Router();
const log = createLogger('import');

// Shared tail for every "external artifact -> proxy" import route: dedupe
// the generated name against what's already saved, persist, and respond.
async function saveImportedProxy(res, proxy, warnings) {
  const all = await proxiesStore.list();
  proxy.name = uniqueName(proxy.name, all.map((p) => p.name));
  await proxiesStore.save(proxy.id, proxy);
  // One line covers all five import routes. The shape of what an importer
  // produced — and how much it had to warn about — is what you compare against
  // the artifact when someone says "the import lost my flows". The warnings
  // themselves are included: they are this app's own text, they are already
  // shown to the user as toasts, and they vanish the moment those toasts fade.
  log.info('proxy imported', {
    name: proxy.name,
    policies: proxy.policies?.length || 0,
    flows: proxy.flows?.length || 0,
    targets: proxy.targets?.length || 0,
    resources: proxy.resources?.length || 0,
    warnings: warnings?.length || 0,
    warningText: warnings?.length ? warnings : undefined,
  });
  res.status(201).json({ proxy, warnings });
}

// Accepts the raw .zip bytes directly (no multipart) — the client sends the
// File's ArrayBuffer as the request body.
router.post('/proxies/import', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file data received.' });
  }
  try {
    const { proxy, warnings } = importProxyZip(req.body);
    await saveImportedProxy(res, proxy, warnings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/proxies/import/curl', async (req, res) => {
  const { curl } = req.body || {};
  if (typeof curl !== 'string') {
    return res.status(400).json({ error: 'No curl command provided.' });
  }
  try {
    const { proxy, warnings } = parseCurlToProxy(curl);
    await saveImportedProxy(res, proxy, warnings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/proxies/import/openapi', async (req, res) => {
  const { spec } = req.body || {};
  if (typeof spec !== 'string') {
    return res.status(400).json({ error: 'No spec text provided.' });
  }
  try {
    const { proxy, warnings } = parseOpenApiToProxy(spec);
    await saveImportedProxy(res, proxy, warnings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/proxies/import/postman', async (req, res) => {
  const { collection } = req.body || {};
  if (typeof collection !== 'string') {
    return res.status(400).json({ error: 'No collection JSON provided.' });
  }
  try {
    const { proxy, warnings } = parsePostmanToProxy(collection);
    await saveImportedProxy(res, proxy, warnings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/proxies/import/wsdl', async (req, res) => {
  const { wsdl } = req.body || {};
  if (typeof wsdl !== 'string') {
    return res.status(400).json({ error: 'No WSDL text provided.' });
  }
  try {
    const { proxy, warnings } = parseWsdlToProxy(wsdl);
    await saveImportedProxy(res, proxy, warnings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
