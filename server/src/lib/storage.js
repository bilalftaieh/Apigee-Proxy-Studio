import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../data');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export function makeCollection(collectionName) {
  const dir = path.join(DATA_DIR, collectionName);

  return {
    async list() {
      await ensureDir(dir);
      const files = await fs.readdir(dir);
      const items = await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map((f) => readJsonSafe(path.join(dir, f)))
      );
      return items.filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async get(id) {
      await ensureDir(dir);
      return readJsonSafe(path.join(dir, `${id}.json`));
    },
    async save(id, data) {
      await ensureDir(dir);
      await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8');
      return data;
    },
    async remove(id) {
      await ensureDir(dir);
      try {
        await fs.unlink(path.join(dir, `${id}.json`));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
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
