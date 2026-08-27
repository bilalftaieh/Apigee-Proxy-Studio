import { Router } from 'express';
import express from 'express';
import { sendZip } from './bundle.js';
import { collectSharedFlowDeployBlockers } from '../lib/deployChecks.js';
import { generateSharedFlowBundleFiles } from '../lib/sharedFlowBundleGenerator.js';
import { importSharedFlowZip } from '../lib/sharedFlowBundleImporter.js';
import { lintSharedFlow } from '../lib/lint.js';
import { normalizeSharedFlow } from '../lib/sharedFlowModel.js';
import { sharedFlowsStore } from '../lib/storage.js';
import { uniqueName } from '../lib/uniqueName.js';

const router = Router();

// Accepts the raw .zip bytes directly (no multipart) — mirrors POST /proxies/import.
router.post('/sharedflow-bundle/import', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file data received.' });
  }
  try {
    const sharedFlow = importSharedFlowZip(req.body);
    const all = await sharedFlowsStore.list();
    sharedFlow.name = uniqueName(sharedFlow.name, all.map((s) => s.name));
    await sharedFlowsStore.save(sharedFlow.id, sharedFlow);
    res.status(201).json({ sharedFlow, warnings: [] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sharedflow-bundle/preview', (req, res) => {
  const sharedFlow = normalizeSharedFlow(req.body?.sharedFlow);
  if (!sharedFlow?.name) return res.status(400).json({ error: 'sharedFlow payload is required' });
  try {
    const files = generateSharedFlowBundleFiles(sharedFlow);
    res.json({ files });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sharedflow-bundle/lint', async (req, res) => {
  const sharedFlow = normalizeSharedFlow(req.body?.sharedFlow);
  if (!sharedFlow?.name) return res.status(400).json({ error: 'sharedFlow payload is required' });
  try {
    const all = await sharedFlowsStore.list();
    const knownSharedFlows = all.filter((s) => s.id !== sharedFlow.id).map((s) => s.name);
    const result = await lintSharedFlow(sharedFlow, { knownSharedFlows });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sharedflow-bundle/export', async (req, res) => {
  const sharedFlow = normalizeSharedFlow(req.body?.sharedFlow);
  if (!sharedFlow?.name) return res.status(400).json({ error: 'sharedFlow payload is required' });

  const all = await sharedFlowsStore.list();
  const knownSharedFlows = all.filter((s) => s.id !== sharedFlow.id).map((s) => s.name);

  let lintResult;
  try {
    lintResult = await lintSharedFlow(sharedFlow, { knownSharedFlows });
  } catch (err) {
    return res.status(500).json({ error: `Could not verify this bundle before export: ${err.message}` });
  }
  const blockers = lintResult.ok
    ? lintResult.files.flatMap((f) => f.messages.filter((m) => m.severity === 'error').map((m) => ({ filePath: f.filePath, ...m })))
    : collectSharedFlowDeployBlockers(sharedFlow, { knownSharedFlows });
  if (blockers.length) {
    return res.status(409).json({
      error: `This shared flow would deploy but not work. Fix ${blockers.length} problem${
        blockers.length === 1 ? '' : 's'
      } first:\n${blockers.map((b) => `• ${b.message}`).join('\n')}`,
      blockers,
    });
  }

  let files;
  try {
    files = generateSharedFlowBundleFiles(sharedFlow);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  await sendZip(res, files, `${sharedFlow.name}.zip`);
});

export default router;
