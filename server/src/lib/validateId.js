// Rejects any :id/:snapshotId route param that isn't a bare filename-safe
// token. These values are joined directly into on-disk paths in storage.js
// (e.g. `${id}.json`), so anything else — path separators, "..", drive
// letters — is a path-traversal attempt rather than a real id.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function requireSafeId(req, res, next, value) {
  if (!SAFE_ID.test(value)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  next();
}
