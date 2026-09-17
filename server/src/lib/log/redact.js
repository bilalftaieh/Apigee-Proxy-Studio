// Redaction for log records.
//
// Distinct from lib/ai/redact.js on purpose. That one is a *reversible*
// pseudonymizer for text leaving the machine for a model; this one is a
// one-way scrubber for text staying on the machine in a file the user may well
// paste into a bug report. Different goal, different rules:
//   - here, over-redacting costs nothing but a `[redacted]` in a log line;
//   - here, the output never has to be turned back into anything usable.
//
// It also bounds the record. A log sink that faithfully serializes whatever it
// is handed is one accidental `log.debug('proxy', { proxy })` away from writing
// a megabyte per line, which is how log files become the reason a machine runs
// out of disk. Depth, array length and string length are all capped.

// Matched against the KEY, case-insensitively, anywhere in it — so `apiKey`,
// `x-goog-api-key`, `GEMINI_API_KEY` and `headers.authorization` are all hit by
// the same short list.
const SECRET_KEY_PATTERN =
  /(authorization|cookie|api[-_ ]?key|apikey|password|passwd|secret|token|credential|private[-_ ]?key|session[-_ ]?id)/i;

// Values that are secret regardless of the key they arrive under, because we
// know them by sight: the API key this process was started with. Read lazily
// (not at module load) so a key set after import — as tests do — is still
// covered.
function envSecrets() {
  const values = [];
  for (const name of ['GEMINI_API_KEY']) {
    const value = process.env[name];
    // Ignore trivially short values: a one-character key would turn every "a"
    // in every log line into [redacted].
    if (value && value.length >= 8) values.push(value);
  }
  return values;
}

// Bearer/Basic credentials pasted into a message string rather than passed as a
// field, plus anything that looks like a Google API key (AIza… / AQ.…).
const INLINE_SECRET_PATTERNS = [
  /\b(bearer|basic)\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /\bAIza[0-9A-Za-z._-]{20,}/g,
  /\bAQ\.[0-9A-Za-z._-]{16,}/g,
];

export const REDACTED = '[redacted]';

/**
 * True when a field name means its value must never be written.
 *
 * Exported because the check has to run at BOTH levels: sanitize() applies it
 * while walking nested objects, and the logger applies it to the top-level
 * fields it is handed directly — those never go through the object walk, so
 * without this `log.info('call', { apiKey })` would write the key in full.
 */
export function isSecretKey(key) {
  return SECRET_KEY_PATTERN.test(key);
}

/** Scrubs secrets that are sitting inside an ordinary string. */
export function scrubString(value) {
  let out = value;
  for (const secret of envSecrets()) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const pattern of INLINE_SECRET_PATTERNS) {
    // Fresh lastIndex each time — these are /g and are module-level constants.
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

function truncate(value, maxString) {
  if (value.length <= maxString) return value;
  return `${value.slice(0, maxString)}…+${value.length - maxString} chars`;
}

/**
 * Serializes an Error into something JSON can carry.
 *
 * `cause` is followed one level deep. It is almost always where the real reason
 * is when a library wraps a low-level failure (a fetch that failed because of
 * DNS says "fetch failed" and nothing else until you look at the cause).
 */
export function serializeError(err, depth = 0) {
  if (!(err instanceof Error)) return err;
  const out = {
    name: err.name,
    message: scrubString(String(err.message || '')),
    stack: err.stack ? scrubString(err.stack) : undefined,
  };
  // Carriers of the actual diagnosis on Node errors: fs gives `code`/`path`,
  // child_process gives `code`/`signal`, this app's own AiProviderError gives
  // `status`.
  for (const key of ['code', 'errno', 'syscall', 'path', 'signal', 'status']) {
    if (err[key] !== undefined) out[key] = err[key];
  }
  if (err.cause && depth < 1) out.cause = serializeError(err.cause, depth + 1);
  return out;
}

/**
 * Returns a JSON-safe, secret-free, size-bounded copy of `value`.
 *
 * Only ever called on records that are actually going to be written — the level
 * gate runs first, so nothing here costs anything for a log call that is off.
 */
export function sanitize(value, limits, depth = 0, seen = new WeakSet()) {
  const { maxDepth, maxString, maxArray, maxKeys } = limits;

  if (value === null || value === undefined) return value;

  const type = typeof value;
  if (type === 'string') return truncate(scrubString(value), maxString);
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return `${value}n`;
  if (type === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (type === 'symbol') return String(value);

  if (value instanceof Error) return sanitize(serializeError(value), limits, depth, seen);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (value instanceof Map) return sanitize(Object.fromEntries(value), limits, depth, seen);
  if (value instanceof Set) return sanitize([...value], limits, depth, seen);

  // A cycle would otherwise be an infinite loop that takes the server down —
  // and cycles are easy to hit, since Express req/res reference each other.
  if (seen.has(value)) return '[circular]';
  if (depth >= maxDepth) return Array.isArray(value) ? `[array ${value.length}]` : '[object]';
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, maxArray).map((item) => sanitize(item, limits, depth + 1, seen));
      if (value.length > maxArray) items.push(`…+${value.length - maxArray} more`);
      return items;
    }

    const out = {};
    let count = 0;
    for (const [key, item] of Object.entries(value)) {
      if (count >= maxKeys) {
        out['…'] = `+${Object.keys(value).length - maxKeys} more keys`;
        break;
      }
      count += 1;
      out[key] = isSecretKey(key) ? REDACTED : sanitize(item, limits, depth + 1, seen);
    }
    return out;
  } finally {
    // Removed on the way out so a value that legitimately appears twice in
    // different branches isn't reported as circular the second time.
    seen.delete(value);
  }
}
