import { Router } from 'express';
import { createReadStream, promises as fs } from 'fs';
import {
  LEVELS,
  LOG_FILE,
  config,
  createLogger,
  flushSync,
  ingestExternal,
  readRing,
  setLevels,
} from '../lib/log/logger.js';

const router = Router();
const log = createLogger('logs');

// One POST from the browser carries a batch. Anything beyond this is dropped
// rather than trusted — the endpoint is unauthenticated (like the rest of this
// loopback API) and a runaway client loop should not be able to fill the disk.
const MAX_BATCH = 200;

/**
 * What the in-app viewer polls.
 *
 * `after` is the cursor from the previous response, so a poll returns only what
 * is new — typically zero records and a few bytes. That is what makes polling
 * every second acceptable rather than wasteful.
 */
router.get('/logs', (req, res) => {
  const { after, level, limit, q } = req.query;
  res.json(
    readRing({
      after: Number.parseInt(after, 10) >= 0 ? Number.parseInt(after, 10) : -1,
      level: typeof level === 'string' && LEVELS[level] !== undefined ? level : 'trace',
      limit: Math.min(Number.parseInt(limit, 10) || 500, 2000),
      q: typeof q === 'string' ? q : '',
    })
  );
});

// Current levels and where the file is, so the viewer can tell you what it is
// showing and where the rest lives.
router.get('/logs/config', async (req, res) => {
  let fileBytes = null;
  try {
    fileBytes = (await fs.stat(LOG_FILE)).size;
  } catch {
    // No file yet (nothing written, or LOG_TO_FILE=false) — reported as null.
  }
  res.json({
    consoleLevel: config.consoleLevel,
    fileLevel: config.fileLevel,
    toFile: config.toFile,
    file: LOG_FILE,
    fileBytes,
    ringSize: config.ringSize,
    levels: Object.keys(LEVELS),
  });
});

/**
 * Raises or lowers verbosity without a restart.
 *
 * Worth having because the interesting bug is usually the one you have already
 * reproduced once: turn on trace, do it again, read the file — rather than
 * restart the server and lose the state that produced it.
 */
router.post('/logs/level', (req, res) => {
  const { consoleLevel, fileLevel } = req.body || {};
  for (const [name, value] of Object.entries({ consoleLevel, fileLevel })) {
    if (value !== undefined && LEVELS[value] === undefined) {
      return res.status(400).json({ error: `${name} must be one of: ${Object.keys(LEVELS).join(', ')}` });
    }
  }
  const applied = setLevels({ consoleLevel, fileLevel });
  log.info('log level changed', applied);
  res.json(applied);
});

/**
 * Browser records, merged into the same ring and the same file as the server's.
 *
 * This is what makes one file enough to debug from: a failed export shows the
 * click that started it, the request, the server's handling and the stack, in
 * order, tied together by the request id the browser read off the response.
 */
router.post('/logs/client', (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : null;
  if (!records) return res.status(400).json({ error: 'records array is required' });

  const accepted = records.slice(0, MAX_BATCH);
  for (const record of accepted) {
    ingestExternal({
      t: record?.t,
      level: record?.level,
      mod: record?.mod,
      msg: record?.msg,
      fields: record?.fields,
      src: 'client',
    });
  }

  if (records.length > MAX_BATCH) {
    log.warn('client log batch truncated', { sent: records.length, kept: MAX_BATCH });
  }
  // 204: the browser has nothing to do with the answer, and an empty response
  // keeps the shipping path as cheap as possible.
  res.status(204).end();
});

/**
 * The whole file, as a download.
 *
 * The viewer holds the last LOG_RING_SIZE records; this is everything since the
 * last rotation, which is what you actually attach to a bug report. Buffered
 * writes are flushed first so the download ends at the line you just saw on
 * screen rather than up to 250ms behind it.
 */
router.get('/logs/download', (req, res) => {
  flushSync();
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', 'attachment; filename="apigee-proxy-studio.log"');
  res.setHeader('Cache-Control', 'no-store');

  const stream = createReadStream(LOG_FILE);
  stream.on('error', (err) => {
    if (err.code === 'ENOENT') {
      if (!res.headersSent) res.status(404).json({ error: 'No log file yet.' });
      return;
    }
    log.error('log download failed', { err });
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.destroy(err);
  });
  stream.pipe(res);
});

export default router;
