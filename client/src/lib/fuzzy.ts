export interface FuzzyMatch {
  /** Higher is better. Only meaningful relative to other matches of the same query. */
  score: number;
  /** Indices in `text` that matched, for highlighting. */
  indices: number[];
}

const BONUS_CONSECUTIVE = 8;
const BONUS_BOUNDARY = 12;
const BONUS_PREFIX = 16;
const PENALTY_GAP = 1;

function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '.' || prev === ':') return true;
  // camelCase / PascalCase hump
  return prev === prev.toLowerCase() && text[i] !== text[i].toLowerCase();
}

/**
 * Subsequence match with positional scoring — the usual command-palette feel:
 * "vjs" finds "VerifyJsonSchema", and a hit on a word boundary outranks one
 * buried mid-word. Returns null when `text` doesn't contain the query at all.
 *
 * This is greedy rather than optimal (no backtracking to find the
 * highest-scoring alignment) — a full DP pass costs more than it's worth for
 * lists of a few hundred short strings.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring is always the best possible read of the query.
  const direct = t.indexOf(q);
  if (direct !== -1) {
    const indices = Array.from({ length: q.length }, (_, k) => direct + k);
    let score = 100 + q.length * BONUS_CONSECUTIVE;
    if (direct === 0) score += BONUS_PREFIX;
    else if (isBoundary(text, direct)) score += BONUS_BOUNDARY;
    return { score, indices };
  }

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let lastHit = -1;
  for (const ch of q) {
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti;
        break;
      }
      ti++;
    }
    if (found === -1) return null;
    indices.push(found);
    if (found === lastHit + 1) score += BONUS_CONSECUTIVE;
    if (isBoundary(text, found)) score += found === 0 ? BONUS_PREFIX : BONUS_BOUNDARY;
    if (lastHit !== -1) score -= Math.min(found - lastHit - 1, 10) * PENALTY_GAP;
    lastHit = found;
    ti++;
  }
  // Shorter targets are more likely to be what you meant.
  score -= Math.min(text.length, 60) / 12;
  return { score, indices };
}

/** Splits `text` into matched/unmatched runs so the caller can wrap the hits. */
export function highlightRuns(text: string, indices: number[]): { text: string; hit: boolean }[] {
  if (indices.length === 0) return [{ text, hit: false }];
  const hits = new Set(indices);
  const runs: { text: string; hit: boolean }[] = [];
  let current = '';
  let currentHit = hits.has(0);
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    if (hit !== currentHit) {
      if (current) runs.push({ text: current, hit: currentHit });
      current = '';
      currentHit = hit;
    }
    current += text[i];
  }
  if (current) runs.push({ text: current, hit: currentHit });
  return runs;
}
