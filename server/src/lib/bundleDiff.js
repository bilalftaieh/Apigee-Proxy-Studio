import { diffLines } from 'diff';
import { canonicalizeXml } from './canonicalXml.js';

/**
 * Compares two file maps as produced by generateBundleFiles (or a raw zip's
 * own entries) at the file level — the unit Apigee versions, the unit you'd
 * inspect in the console, and the unit whose diffs are actually readable.
 * XML files are canonicalized first (item 4's canonicalizeXml) so
 * whitespace/attribute-order/comment churn never shows up as a change; every
 * other file (policy resources — JS, properties, ...) is compared as raw text.
 *
 * `left` is the "before"/"local" side, `right` is the "after"/"remote" side —
 * added means present only in `right`, removed means present only in `left`.
 *
 * Returns { added: [path], removed: [path], changed: [{ path, hunks }], unchanged: [path] }.
 */
export function diffBundles(leftFiles, rightFiles) {
  const paths = [...new Set([...Object.keys(leftFiles), ...Object.keys(rightFiles)])].sort();
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const path of paths) {
    const left = leftFiles[path];
    const right = rightFiles[path];
    if (left === undefined) {
      added.push(path);
      continue;
    }
    if (right === undefined) {
      removed.push(path);
      continue;
    }
    const [canonLeft, canonRight] = path.endsWith('.xml') ? [canonicalizeXml(left), canonicalizeXml(right)] : [left, right];
    if (canonLeft === canonRight) {
      unchanged.push(path);
    } else {
      changed.push({ path, hunks: diffLines(canonLeft, canonRight) });
    }
  }

  return { added, removed, changed, unchanged };
}
