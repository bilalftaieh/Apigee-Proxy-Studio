import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './log/logger.js';

const log = createLogger('storage');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Where proxies, shared flows, templates and history live on disk.
//
// Overridable so a test run can be pointed at a throwaway directory rather than
// the workspaces you are actually using. Tests that create and delete real
// proxies are fine right up until a cleanup step doesn't run.
//
// Read once, at module load: every collection below resolves its own path from
// it immediately, so anything that wants to override it has to do so before
// this module is evaluated.
export const DATA_DIR = path.resolve(
  process.env.APIGEE_STUDIO_DATA_DIR || path.join(__dirname, '../../data')
);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    // A file that is present but unparseable is the difference between "that
    // proxy is gone" (which the UI shows plainly) and "that proxy is corrupt"
    // (which looks identical to the user and nothing like it on disk). Named
    // here so the file says which one happened, then rethrown unchanged.
    log.error('unreadable workspace file', { file: path.basename(filePath), err });
    throw err;
  }
}

export function makeCollection(collectionName) {
  const dir = path.join(DATA_DIR, collectionName);
  // Every line from this collection is tagged with its name, so the file shows
  // "which store" without each call site repeating it.
  const storeLog = log.child({ store: collectionName });

  return {
    async list() {
      const done = storeLog.start('list');
      await ensureDir(dir);
      const files = await fs.readdir(dir);
      const items = await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map((f) => readJsonSafe(path.join(dir, f)))
      );
      const sorted = items.filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      done('debug', { items: sorted.length });
      return sorted;
    },
    async get(id) {
      const done = storeLog.start('get', { id });
      await ensureDir(dir);
      const item = await readJsonSafe(path.join(dir, `${id}.json`));
      done('debug', { found: Boolean(item) });
      return item;
    },
    async save(id, data) {
      const done = storeLog.start('save', { id });
      await ensureDir(dir);
      const json = JSON.stringify(data, null, 2);
      await fs.writeFile(path.join(dir, `${id}.json`), json, 'utf-8');
      // The byte count is the cheap early warning for a workspace growing in a
      // way that will later show up as "saving got slow".
      done('debug', { bytes: json.length });
      return data;
    },
    async remove(id) {
      await ensureDir(dir);
      try {
        await fs.unlink(path.join(dir, `${id}.json`));
        storeLog.info('removed', { id });
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        storeLog.debug('remove skipped — already gone', { id });
      }
    },
  };
}

export const proxiesStore = makeCollection('proxies');
export const templatesStore = makeCollection('templates');
export const sharedFlowsStore = makeCollection('sharedflows');

const HISTORY_DIR = path.join(DATA_DIR, 'history');
const MAX_HISTORY_PER_PROXY = 20;

// Rolling per-proxy save history: server/data/history/<proxyId>/<snapshotId>.json.
// Each snapshot holds a full prior proxy JSON, capped to the most recent
// MAX_HISTORY_PER_PROXY entries.
export const historyStore = {
  async list(ownerId) {
    const dir = path.join(HISTORY_DIR, ownerId);
    await ensureDir(dir);
    const files = await fs.readdir(dir);
    const items = await Promise.all(
      files.filter((f) => f.endsWith('.json')).map((f) => readJsonSafe(path.join(dir, f)))
    );
    return items.filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },
  async get(ownerId, snapshotId) {
    const dir = path.join(HISTORY_DIR, ownerId);
    return readJsonSafe(path.join(dir, `${snapshotId}.json`));
  },
  async save(ownerId, snapshot) {
    const dir = path.join(HISTORY_DIR, ownerId);
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, `${snapshot.id}.json`), JSON.stringify(snapshot, null, 2), 'utf-8');
    const items = await this.list(ownerId);
    for (const stale of items.slice(MAX_HISTORY_PER_PROXY)) {
      await fs.unlink(path.join(dir, `${stale.id}.json`)).catch(() => {});
    }
  },
  async removeAll(ownerId) {
    await fs.rm(path.join(HISTORY_DIR, ownerId), { recursive: true, force: true }).catch(() => {});
  },
};
