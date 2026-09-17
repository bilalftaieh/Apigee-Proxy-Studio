// The server's logger. No dependencies, three sinks, one level check.
//
// WHY NOT pino/winston: this process is a single local server whose log volume
// is measured in hundreds of lines per session, and the cost of a logging
// library here is not CPU — it is that a dependency's defaults decide what ends
// up in a file the user is going to read. The tradeoffs that actually matter
// for this app (what gets redacted, what the terminal shows vs what the file
// keeps, how the in-app viewer is fed) are all configuration we would be
// writing anyway.
//
// EFFICIENCY, concretely:
//   - One integer comparison rejects a disabled log call before any string is
//     built, any object walked or any JSON produced. `log.debug(...)` at level
//     info costs a property read and a compare.
//   - The record is built ONCE and shared by all three sinks.
//   - File writes are batched: lines accumulate and go to the stream in one
//     write per flush window (or immediately once they exceed a byte
//     threshold), instead of one syscall per line.
//   - The flush timer is unref()'d, so a pending flush never keeps the process
//     alive, and a blocking flush runs on the way out so nothing is lost.
//   - The in-memory ring is a fixed-size circular array — no shifting, no
//     growth, bounded memory no matter how long the server runs.
//
// TWO LEVELS ON PURPOSE: the terminal shows LOG_LEVEL (default info) so it
// stays readable, while the file and the in-app viewer keep LOG_FILE_LEVEL
// (default debug) so the detail you need when something breaks was already
// being recorded before it broke. The verbose sink is the asynchronous one.

import { createWriteStream, appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isSecretKey, REDACTED, sanitize, scrubString, serializeError } from './redact.js';

export const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: 100 };
const LEVEL_NAMES = Object.keys(LEVELS);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function envLevel(name, fallback) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  return LEVELS[raw] !== undefined ? raw : fallback;
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function envBool(name, fallback) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export const config = {
  // What the terminal prints.
  consoleLevel: envLevel('LOG_LEVEL', 'info'),
  // What the file and the in-app viewer keep. Cheaper than it looks: writes are
  // batched and off the request path.
  fileLevel: envLevel('LOG_FILE_LEVEL', 'debug'),
  // Off by default under the test runner. Every suite that imports a module
  // which logs — ai/provider.js, lint.js, storage.js — would otherwise append
  // to the real server/logs/studio.log, and a file half full of stubbed test
  // traffic is worse than no file: you read a 503 from a fake provider as a
  // real outage. `node --test` sets NODE_TEST_CONTEXT in each test child, and
  // a suite that genuinely wants file output (the logger's own) sets
  // LOG_TO_FILE explicitly.
  toFile: envBool('LOG_TO_FILE', !process.env.NODE_TEST_CONTEXT && process.env.NODE_ENV !== 'test'),
  toConsole: envBool('LOG_TO_CONSOLE', true),
  // Human-readable single lines vs raw NDJSON on stdout. Defaults to whichever
  // suits the destination: a terminal gets colour, a pipe gets JSON.
  pretty: envBool('LOG_PRETTY', process.stdout.isTTY === true),
  dir: path.resolve(process.env.LOG_DIR || path.join(__dirname, '../../../logs')),
  maxBytes: envInt('LOG_MAX_BYTES', 5 * 1024 * 1024),
  maxFiles: envInt('LOG_MAX_FILES', 5),
  // How far back the in-app viewer can reach without reading the file.
  ringSize: envInt('LOG_RING_SIZE', 2000),
  flushMs: envInt('LOG_FLUSH_MS', 250),
  flushBytes: envInt('LOG_FLUSH_BYTES', 64 * 1024),
  limits: {
    maxDepth: envInt('LOG_MAX_DEPTH', 6),
    maxString: envInt('LOG_MAX_STRING', 2000),
    maxArray: envInt('LOG_MAX_ARRAY', 50),
    maxKeys: envInt('LOG_MAX_KEYS', 60),
  },
};

export const LOG_FILE = path.join(config.dir, 'studio.log');

// The single gate every log call passes through first. The ring is fed at the
// file level and is never switched off — it is what the in-app viewer reads, so
// "see everything" holds even for someone running with LOG_TO_FILE=false.
let minLevel = LEVELS.info;

function recomputeMinLevel() {
  minLevel = Math.min(
    config.toConsole ? LEVELS[config.consoleLevel] : LEVELS.silent,
    LEVELS[config.fileLevel]
  );
}
recomputeMinLevel();

/** Changes levels at runtime — the /api/logs/level endpoint, and tests. */
export function setLevels({ consoleLevel, fileLevel } = {}) {
  if (consoleLevel && LEVELS[consoleLevel] !== undefined) config.consoleLevel = consoleLevel;
  if (fileLevel && LEVELS[fileLevel] !== undefined) config.fileLevel = fileLevel;
  recomputeMinLevel();
  return { consoleLevel: config.consoleLevel, fileLevel: config.fileLevel };
}

// ---------------------------------------------------------------------------
// Sink 1: the in-memory ring
// ---------------------------------------------------------------------------

// Fixed-size circular buffer. `writes` only ever increases, so it doubles as a
// monotonic cursor the viewer can poll against ("everything after 1423")
// without re-sending what it already has.
const ring = new Array(config.ringSize);
let writes = 0;

function pushRing(record) {
  ring[writes % config.ringSize] = record;
  writes += 1;
}

/**
 * Records still held in memory, oldest first.
 *
 * @param {object} opts
 * @param {number} [opts.after] only records whose seq is greater than this
 * @param {string} [opts.level] minimum level name
 * @param {number} [opts.limit] most recent N matches
 * @param {string} [opts.q] case-insensitive substring over message and module
 */
export function readRing({ after = -1, level = 'trace', limit = 500, q = '' } = {}) {
  const floor = LEVELS[level] ?? LEVELS.trace;
  const needle = String(q || '').trim().toLowerCase();
  const start = Math.max(0, writes - config.ringSize);
  const out = [];

  for (let i = start; i < writes; i += 1) {
    const record = ring[i % config.ringSize];
    if (!record || record.seq <= after) continue;
    if (LEVELS[record.l] < floor) continue;
    if (needle && !`${record.msg} ${record.mod}`.toLowerCase().includes(needle)) continue;
    out.push(record);
  }

  return {
    records: out.slice(-limit),
    cursor: writes - 1,
    // How many matches the limit cut, so the viewer can say "showing the last
    // 500 of 1200" rather than silently hiding them.
    truncated: Math.max(0, out.length - limit),
  };
}

// ---------------------------------------------------------------------------
// Sink 2: the file (NDJSON, batched, rotated)
// ---------------------------------------------------------------------------

let stream = null;
let streamBytes = 0;
let pending = [];
let pendingBytes = 0;
let flushTimer = null;
let fileBroken = false;

function openStream() {
  if (stream || fileBroken) return stream;
  try {
    mkdirSync(config.dir, { recursive: true });
    streamBytes = statSync(LOG_FILE).size;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // An unwritable log directory must not take the server down — logging is
      // support machinery, not the job. Say so once on stderr, then stay off.
      fileBroken = true;
      console.error(`[log] file logging disabled: ${err.message}`);
      return null;
    }
    streamBytes = 0;
  }
  stream = createWriteStream(LOG_FILE, { flags: 'a' });
  stream.on('error', (err) => {
    fileBroken = true;
    stream = null;
    console.error(`[log] file logging disabled: ${err.message}`);
  });
  return stream;
}

// studio.log -> studio.log.1 -> studio.log.2 … dropping the oldest. Synchronous
// on purpose: it happens once per maxBytes (5MB by default), and doing it
// inline means there is no window in which a queued write lands in the file
// that is about to be renamed.
function rotate() {
  if (stream) {
    stream.end();
    stream = null;
  }
  try {
    rmSync(`${LOG_FILE}.${config.maxFiles}`, { force: true });
    for (let i = config.maxFiles - 1; i >= 1; i -= 1) {
      try {
        renameSync(`${LOG_FILE}.${i}`, `${LOG_FILE}.${i + 1}`);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[log] rotation failed: ${err.message}`);
  }
  streamBytes = 0;
}

/**
 * Takes the buffered lines, leaving the buffer empty.
 *
 * Both flush paths drain through here so neither can write a chunk the other
 * has already written.
 */
function drain() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pending.length) return '';
  const chunk = pending.join('');
  pending = [];
  pendingBytes = 0;
  return chunk;
}

/**
 * Rotates first if this chunk would push the file past the cap.
 *
 * Both writers call it. An earlier version checked the size only on the async
 * path, which meant a process that crashed repeatedly — flushing synchronously
 * each time on its way out — grew the file without bound, since the cap was
 * only ever enforced by the path it was not taking.
 */
function ensureRoom(chunkLength) {
  if (config.maxBytes <= 0) return;
  if (streamBytes === 0 && !stream) {
    // Nothing has been written by this process yet, so the file's real size is
    // whatever a previous run left behind.
    try {
      streamBytes = statSync(LOG_FILE).size;
    } catch {
      streamBytes = 0;
    }
  }
  if (streamBytes + chunkLength > config.maxBytes) rotate();
}

function flush() {
  const chunk = drain();
  if (!chunk) return;

  ensureRoom(chunk.length);
  const out = openStream();
  if (!out) return;
  out.write(chunk);
  streamBytes += Buffer.byteLength(chunk);
}

/**
 * Writes whatever is buffered using a blocking call.
 *
 * Used on the way out (exit, a signal, a fatal) and before serving the log
 * file for download. The whole point of the async batching is that it is
 * asynchronous, which is exactly wrong when the process is about to stop
 * existing — the last few lines before a crash are the ones worth having.
 */
export function flushSync() {
  if (fileBroken) return;
  const chunk = drain();
  if (!chunk) return;
  try {
    mkdirSync(config.dir, { recursive: true });
    ensureRoom(chunk.length);
    appendFileSync(LOG_FILE, chunk);
    streamBytes += Buffer.byteLength(chunk);
  } catch {
    // Nothing useful left to do — we are already on the way out.
  }
}

function queueLine(line) {
  if (fileBroken) return;
  pending.push(line);
  pendingBytes += line.length;

  // A burst (an import, a lint run's worth of detail) goes out immediately
  // rather than sitting in memory waiting for a 250ms timer.
  if (pendingBytes >= config.flushBytes) {
    flush();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flush, config.flushMs);
    // Never hold the event loop open for a log line.
    flushTimer.unref?.();
  }
}

// ---------------------------------------------------------------------------
// Sink 3: the console
// ---------------------------------------------------------------------------

const ESC = String.fromCharCode(27);
const COLORS = {
  trace: `${ESC}[90m`,
  debug: `${ESC}[36m`,
  info: `${ESC}[32m`,
  warn: `${ESC}[33m`,
  error: `${ESC}[31m`,
  fatal: `${ESC}[35m`,
};
const DIM = `${ESC}[90m`;
const RESET = `${ESC}[0m`;

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;
const paint = (color, text) => (useColor ? `${color}${text}${RESET}` : text);

// `12:04:09.412` — the date is in the file record; on a terminal you only ever
// care about the time relative to the thing you just did.
function clockTime(iso) {
  return iso.slice(11, 23);
}

function formatValue(value) {
  if (typeof value === 'string') return /[\s"]/.test(value) ? JSON.stringify(value) : value;
  if (value === null || typeof value !== 'object') return String(value);
  const json = JSON.stringify(value);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

function writeConsole(record) {
  if (!config.pretty) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return;
  }

  const { t, l, mod, msg, seq, src, err, ...fields } = record;
  let line =
    `${paint(DIM, clockTime(t))} ` +
    `${paint(COLORS[l] || '', l.toUpperCase().padEnd(5))} ` +
    `${paint(DIM, (src === 'client' ? `ui:${mod}` : mod).padEnd(14))} ${msg}`;

  const extras = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${paint(DIM, `${key}=`)}${formatValue(value)}`);
  if (extras.length) line += ` ${extras.join(' ')}`;

  // The stack goes on its own lines rather than as a \n-riddled field value —
  // it is the one thing you actually read when a request 500s.
  if (err?.stack) line += `\n${paint(DIM, err.stack)}`;
  else if (err?.message) line += ` ${paint(COLORS.error, err.message)}`;

  const out = LEVELS[l] >= LEVELS.warn ? process.stderr : process.stdout;
  out.write(`${line}\n`);
}

// ---------------------------------------------------------------------------
// The logger itself
// ---------------------------------------------------------------------------

function emit(level, mod, bindings, msg, fields) {
  const levelValue = LEVELS[level];
  const record = {
    t: new Date().toISOString(),
    l: level,
    mod,
    msg: scrubString(String(msg)),
    seq: writes,
  };

  if (bindings) Object.assign(record, bindings);

  if (fields) {
    // An Error passed as `err` is the common case and gets the dedicated
    // treatment (stack, code, cause); everything else is sanitized generically.
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (isSecretKey(key)) {
        record[key] = REDACTED;
      } else if (value instanceof Error) {
        record[key] = sanitize(serializeError(value), config.limits);
      } else {
        record[key] = sanitize(value, config.limits);
      }
    }
  }

  pushRing(record);
  if (config.toFile && levelValue >= LEVELS[config.fileLevel]) queueLine(`${JSON.stringify(record)}\n`);
  if (config.toConsole && levelValue >= LEVELS[config.consoleLevel]) writeConsole(record);
}

/**
 * Ingests a record that came from somewhere else — the browser, via
 * /api/logs/client — so it lands in the same ring and the same file,
 * interleaved with the server's own lines in timestamp order.
 */
export function ingestExternal({ t, level, mod, msg, fields, src = 'client' }) {
  const l = LEVELS[level] !== undefined && level !== 'silent' ? level : 'info';
  const record = {
    t: typeof t === 'string' ? t : new Date().toISOString(),
    l,
    mod: String(mod || 'client').slice(0, 40),
    msg: scrubString(String(msg ?? '')).slice(0, config.limits.maxString),
    seq: writes,
    src,
  };
  // Wrapped in an object literal before sanitizing so the browser's field names
  // go through the same key check as the server's own.
  if (fields && typeof fields === 'object') Object.assign(record, sanitize({ ...fields }, config.limits));

  pushRing(record);
  if (config.toFile && LEVELS[l] >= LEVELS[config.fileLevel]) queueLine(`${JSON.stringify(record)}\n`);
  if (config.toConsole && LEVELS[l] >= LEVELS[config.consoleLevel]) writeConsole(record);
}

function build(mod, bindings) {
  const logger = {
    /**
     * True when a record at this level would reach any sink. Guard genuinely
     * expensive field-gathering with it:
     *   if (log.enabled('debug')) log.debug('bundle built', { files: describe(files) });
     */
    enabled(level) {
      return LEVELS[level] >= minLevel;
    },

    /** A logger with extra fields stamped on every record — a request id, a proxy id. */
    child(extra) {
      return build(mod, { ...bindings, ...extra });
    },

    /**
     * Starts a timer and returns the function that closes it.
     *
     *   const done = log.start('lint', { policies: 12 });
     *   …
     *   done('info', { findings: 3 });   // logs "lint" with ms=…
     *
     * Duration comes from hrtime, not Date.now(), so it is monotonic and
     * unaffected by the wall clock moving underneath a long operation.
     */
    start(msg, fields) {
      const began = process.hrtime.bigint();
      logger.trace(`${msg} start`, fields);
      return (level = 'debug', extra) => {
        const ms = Number(process.hrtime.bigint() - began) / 1e6;
        logger[level](msg, { ...fields, ...extra, ms: Math.round(ms * 100) / 100 });
        return ms;
      };
    },
  };

  for (const level of LEVEL_NAMES) {
    if (level === 'silent') continue;
    const value = LEVELS[level];
    logger[level] = (msg, fields) => {
      // THE GATE. A disabled call costs this compare and nothing else.
      if (value < minLevel) return;
      emit(level, mod, bindings, msg, fields);
    };
  }

  return logger;
}

/** @param {string} mod short module tag shown on every line ('http', 'storage', 'ai'). */
export function createLogger(mod, bindings) {
  return build(mod, bindings);
}

export const log = createLogger('server');

// Buffered lines must not die with the process.
let exitHooked = false;
export function installExitFlush() {
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', flushSync);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      log.info('shutting down', { signal });
      flushSync();
      process.exit(0);
    });
  }
}
