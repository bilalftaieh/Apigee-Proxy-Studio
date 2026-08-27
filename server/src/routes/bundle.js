import { Router } from 'express';
import express from 'express';
import archiver from 'archiver';
import yaml from 'js-yaml';
import { generateBundleFiles } from '../lib/bundleGenerator.js';
import { generateSharedFlowBundleFiles } from '../lib/sharedFlowBundleGenerator.js';
import { normalizeSharedFlow } from '../lib/sharedFlowModel.js';
import { applyEnvironmentOverrides, normalizeProxy } from '../lib/model.js';
import { generatePostmanCollection } from '../lib/postmanExporter.js';
import { generateOpenApiSpec } from '../lib/openApiExporter.js';
import { collectDeployBlockers } from '../lib/deployChecks.js';
import { lintProxy } from '../lib/lint.js';
import { collectPrerequisites } from '../lib/prerequisites.js';
import { diffBundles } from '../lib/bundleDiff.js';
import { importProxyZip } from '../lib/bundleImporter.js';
import { sharedFlowsStore, historyStore } from '../lib/storage.js';

const router = Router();

// Builds the zip fully in memory before a single byte goes to the client.
//
// Streaming with archive.pipe(res) cannot report failure: the headers are
// already flushed by the time archiver can emit 'error', and res.status(500)
// after that is a silent no-op in Express. The client then sees HTTP 200 with a
// truncated archive and saves it as a successful export — which fails at
// `Import bundle` time with nothing to explain why. These bundles are a couple
// of KB, so buffering costs nothing and lets errors become real 500s. It also
// gives us a Content-Length, so a truncated download is detectable.
// Zips a "relative path -> content" map into a Buffer. `content` may be a
// string or a Buffer, so a zip can itself be an entry in another zip — which
// is how /bundle/export-set ships several independently-importable bundles in
// one download.
export function buildZipBuffer(files) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (c) => chunks.push(c));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    for (const [filePath, content] of Object.entries(files)) {
      archive.append(content, { name: filePath });
    }
    archive.finalize();
  });
}

export async function sendZip(res, files, filename) {
  let buf;
  try {
    buf = await buildZipBuffer(files);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: `Failed to build the bundle: ${err.message}` });
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}

// 409 rather than 400: the payload is well-formed, it just describes a proxy
// that would deploy and then fail on every request. Mirrors the client's lint
// gate so the artifact can't be produced by calling the API directly either.
function rejectIfUndeployable(res, blockers) {
  if (!blockers.length) return false;
  res.status(409).json({
    error: `This proxy would deploy but not work. Fix ${blockers.length} problem${
      blockers.length === 1 ? '' : 's'
    } first:\n${blockers.map((b) => `• ${b.message}`).join('\n')}`,
    blockers,
  });
  return true;
}

router.post('/bundle/preview', (req, res) => {
  const proxy = applyEnvironmentOverrides(normalizeProxy(req.body?.proxy), req.body?.environmentId);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });
  try {
    const files = generateBundleFiles(proxy);
    res.json({ files });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bundle/prerequisites', (req, res) => {
  const proxy = applyEnvironmentOverrides(normalizeProxy(req.body?.proxy), req.body?.environmentId);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });
  try {
    res.json({ items: collectPrerequisites(proxy) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Resolves one side of a diff request to a proxy: either a proxy JSON sent
// directly, or a pointer at a snapshot in this proxy's save history.
async function resolveDiffSide(spec, fallbackEnvironmentId) {
  if (!spec || typeof spec !== 'object') throw new Error('Each diff side must include either `proxy` or `proxyId`+`snapshotId`.');
  const environmentId = spec.environmentId ?? fallbackEnvironmentId;
  if (spec.proxyId && spec.snapshotId) {
    const snapshot = await historyStore.get(spec.proxyId, spec.snapshotId);
    if (!snapshot) throw new Error('Snapshot not found.');
    return applyEnvironmentOverrides(normalizeProxy(snapshot.proxy), environmentId);
  }
  if (spec.proxy) return applyEnvironmentOverrides(normalizeProxy(spec.proxy), environmentId);
  throw new Error('Each diff side must include either `proxy` or `proxyId`+`snapshotId`.');
}

// File-level diff (item 5) — used both for "snapshot vs current/another
// snapshot" (HistoryModal) and "current vs an externally imported bundle"
// (the drift check): the client resolves an uploaded zip to a proxy via
// /bundle/parse-zip first, then diffs it here like any other side.
router.post('/bundle/diff', async (req, res) => {
  try {
    const { left, right, environmentId } = req.body || {};
    const [leftProxy, rightProxy] = await Promise.all([resolveDiffSide(left, environmentId), resolveDiffSide(right, environmentId)]);
    const leftFiles = generateBundleFiles(leftProxy);
    const rightFiles = generateBundleFiles(rightProxy);
    // The raw (non-canonicalized) file maps ride along too, so the client can
    // hand each changed/added/removed file straight to Monaco's DiffEditor
    // without a second round trip — classification above already used the
    // canonicalized text so whitespace-only churn doesn't count as a change.
    res.json({ ...diffBundles(leftFiles, rightFiles), leftFiles, rightFiles });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Parses a bundle zip into a proxy without saving it anywhere — the
// drift-check's way of turning "a zip downloaded from Apigee" into something
// /bundle/diff can compare against a local proxy.
router.post('/bundle/parse-zip', express.raw({ type: () => true, limit: '20mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file data received.' });
  }
  try {
    const { proxy, warnings } = importProxyZip(req.body);
    res.json({ proxy, warnings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bundle/export', async (req, res) => {
  const proxy = applyEnvironmentOverrides(normalizeProxy(req.body?.proxy), req.body?.environmentId);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });

  // Environment overrides are applied above, so the target URL checked here is
  // the one that will actually be in this zip. Runs the same apigeelint pass
  // as the Lint tab / Export button — previously this route only checked our
  // own deploy blockers, so calling it any other way than the UI button skipped
  // the apigeelint gate entirely.
  const sharedFlows = await sharedFlowsStore.list();
  const knownSharedFlows = sharedFlows.map((s) => s.name);
  let lintResult;
  try {
    lintResult = await lintProxy(proxy, { knownSharedFlows });
  } catch (err) {
    return res.status(500).json({ error: `Could not verify this bundle before export: ${err.message}` });
  }
  if (lintResult.ok) {
    const errors = lintResult.files.flatMap((f) => f.messages.filter((m) => m.severity === 'error').map((m) => ({ filePath: f.filePath, ...m })));
    if (rejectIfUndeployable(res, errors)) return;
  } else {
    // apigeelint itself couldn't run — fall back to the cheap, dependency-free
    // deploy-blocker check rather than hard-failing the export, mirroring the
    // UI's own "warns and proceeds" behavior for this failure mode.
    if (rejectIfUndeployable(res, collectDeployBlockers(proxy, { knownSharedFlows }))) return;
  }

  const env = (proxy.environments || []).find((e) => e.id === req.body?.environmentId);
  const suffix = env ? `-${env.name}` : '';

  let files;
  try {
    files = generateBundleFiles(proxy);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  await sendZip(res, files, `${proxy.name}${suffix}.zip`);
});

// Zips the proxy bundle plus every shared flow it calls via FlowCallout, so
// "deployed the proxy, forgot the shared flow" — a real, easy-to-hit failure
// mode once a proxy depends on more than one — can't happen. Not gated on the
// same lint pass as /bundle/export: this is a convenience packaging step, not
// the artifact of record.
router.post('/bundle/export-set', async (req, res) => {
  const proxy = applyEnvironmentOverrides(normalizeProxy(req.body?.proxy), req.body?.environmentId);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });

  const referencedNames = [
    ...new Set(
      (proxy.policies || [])
        .map((p) => String(p.xml || '').match(/<SharedFlowBundle>([^<]*)<\/SharedFlowBundle>/)?.[1]?.trim())
        .filter(Boolean)
    ),
  ];
  const allSharedFlows = await sharedFlowsStore.list();
  const matched = referencedNames.map((name) => allSharedFlows.find((sf) => sf.name === name)).filter(Boolean);
  const missingNames = referencedNames.filter((name) => !allSharedFlows.some((sf) => sf.name === name));

  let files;
  try {
    files = generateBundleFiles(proxy);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Each bundle goes in as its own nested .zip, NOT as a directory tree.
  // Apigee's "Import bundle" requires apiproxy/ (or sharedflowbundle/) at the
  // zip *root*, so a `proxy/apiproxy/...` layout would force the user to
  // extract and re-zip before anything here could be imported.
  const combined = {};
  try {
    combined[`${proxy.name}.zip`] = await buildZipBuffer(files);
    for (const sf of matched) {
      combined[`${sf.name}.zip`] = await buildZipBuffer(generateSharedFlowBundleFiles(normalizeSharedFlow(sf)));
    }
  } catch (err) {
    return res.status(500).json({ error: `Failed to build the deploy set: ${err.message}` });
  }

  const readme = [
    `Deploy set for "${proxy.name}"`,
    '',
    'Each .zip in here imports directly — no extracting or re-zipping needed.',
    '',
    'Import order (shared flows must be deployed before the proxy that calls them):',
    ...matched.map((sf, i) => `  ${i + 1}. ${sf.name}.zip — import and deploy this shared flow`),
    `  ${matched.length + 1}. ${proxy.name}.zip — import and deploy the proxy last`,
  ];
  if (missingNames.length) {
    readme.push(
      '',
      "Referenced by a FlowCallout policy but not found among your saved shared flows — verify these already exist and are deployed in your org, or build them in Studio first:",
      ...missingNames.map((n) => `  - ${n}`)
    );
  }
  combined['README.txt'] = `${readme.join('\n')}\n`;

  await sendZip(res, combined, `${proxy.name}-deploy-set.zip`);
});

router.post('/bundle/export-postman', (req, res) => {
  const proxy = normalizeProxy(req.body?.proxy);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });

  let collection;
  try {
    collection = generatePostmanCollection(proxy);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${proxy.name}.postman_collection.json"`);
  res.send(JSON.stringify(collection, null, 2));
});

router.post('/bundle/export-openapi', (req, res) => {
  const proxy = normalizeProxy(req.body?.proxy);
  if (!proxy?.name) return res.status(400).json({ error: 'proxy payload is required' });
  const format = req.body?.format === 'yaml' ? 'yaml' : 'json';

  let spec;
  try {
    spec = generateOpenApiSpec(proxy);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const body = format === 'yaml' ? yaml.dump(spec, { noRefs: true, lineWidth: -1 }) : JSON.stringify(spec, null, 2);
  res.setHeader('Content-Type', format === 'yaml' ? 'application/yaml' : 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${proxy.name}.openapi.${format}"`);
  res.send(body);
});

export default router;
