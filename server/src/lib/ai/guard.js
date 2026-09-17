// Last line of defence before anything crosses the network.
//
// This is deliberately NOT how sensitive data is kept out of a prompt — that job
// belongs to the allowlist in safeContext.js, which never picks up a sensitive
// field in the first place. This is a self-test of that allowlist: it rebuilds
// the set of literals we believe are sensitive and scans the finished payload
// for them. If it ever fires, the allowlist has a bug.
//
// It fails CLOSED. A leak aborts the request rather than logging a warning and
// sending anyway, because the whole point is that there is no second chance once
// the bytes have left.

import { collectProxySecrets, createRedactionMap, secretValues } from './redact.js';

export class LeakError extends Error {
  constructor(matches) {
    super(
      `Blocked: the request to the AI provider contained ${matches.length} value(s) from your proxy ` +
        `that should have been replaced with placeholders (${matches.map((m) => m.kind).join(', ')}). ` +
        `Nothing was sent. This is a bug in the prompt builder, not a configuration problem.`
    );
    this.name = 'LeakError';
    // Kinds only. The real values are deliberately NOT kept on the error.
    // An Error is the one object in a request that tends to get logged
    // wholesale — `console.error(err)` prints custom properties too — and a
    // guard that stops secrets crossing the network only to write them to
    // stdout has moved the leak, not closed it.
    this.kinds = matches.map((m) => m.kind);
  }
}

// Values too short or too generic to be meaningful evidence of a leak. Matching
// on them would make the guard fire constantly on coincidence — "default" is a
// TargetServer name in plenty of proxies and also an ordinary English word — and
// a guard that cries wolf gets switched off.
const MIN_MATCH_LENGTH = 6;
const IGNORED = new Set(['default', 'apiproxy', 'localhost', 'example.com']);

/**
 * Removes the text the payload contains because THIS repo put it there — the
 * system instruction, the scraped Apigee grammar, the blank policy template,
 * the response schema. What is left is the content that could carry something
 * from the user's workspace, and that is what gets searched.
 *
 * Without this the guard reports its own grammar as a leak. Apigee has an
 * element named `Authentication`; a TargetServer named `Authentication` is
 * perfectly ordinary; the two collide in the prompt and every generation on
 * that proxy aborts with "this is a bug in the prompt builder" — the one
 * failure mode guaranteed to get a fail-closed guard switched off.
 *
 * Subtracting is only safe because these strings are compile-time constants of
 * this codebase and of our own static policy catalogue: none of them can carry
 * a value from the user's workspace, so a match inside one is a coincidence by
 * construction rather than a leak. NOTHING derived from the proxy or from the
 * user's input may ever be passed here — doing so would blind the guard to
 * exactly what it exists to catch.
 */
function subtractStaticText(haystack, staticText) {
  let out = haystack;
  for (const chunk of staticText) {
    if (!chunk || chunk.length < MIN_MATCH_LENGTH) continue;
    // The payload is searched after JSON.stringify, where newlines and quotes
    // are escaped, so a chunk has to be looked for in both forms. Escaping is
    // per-character, which is what keeps a contiguous chunk contiguous once
    // it is embedded in the serialized body.
    for (const form of [chunk, JSON.stringify(chunk).slice(1, -1)]) {
      // Replaced with a newline, not removed: splicing the neighbours together
      // could manufacture a match that was never in the payload.
      if (out.includes(form)) out = out.split(form).join('\n');
    }
  }
  return out;
}

/**
 * @param {string[]} staticText Text this codebase contributed to the payload
 *   itself — see subtractStaticText. Callers pass their own constants and
 *   nothing else.
 */
export function findLeaks(payload, proxy, staticText = []) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const haystack = staticText.length ? subtractStaticText(serialized, staticText) : serialized;
  const map = collectProxySecrets(proxy, createRedactionMap());

  const matches = [];
  for (const real of secretValues(map)) {
    if (real.length < MIN_MATCH_LENGTH) continue;
    if (IGNORED.has(real.toLowerCase())) continue;
    if (haystack.includes(real)) {
      matches.push({ kind: map.forward.get(real).replace(/[{}]|_\d+/g, ''), value: real });
    }
  }
  return matches;
}

// Throws LeakError if the payload still carries anything sensitive.
export function assertNoLeak(payload, proxy, staticText = []) {
  const matches = findLeaks(payload, proxy, staticText);
  if (matches.length) throw new LeakError(matches);
  return true;
}
