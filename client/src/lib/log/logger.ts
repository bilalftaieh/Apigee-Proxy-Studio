// The browser half of the logging system.
//
// Same idea as the server's: one level check, a bounded in-memory ring, and
// batched delivery. What it adds is that records above `shipLevel` are POSTed
// to the server in batches, so they land in the same file as the server's own
// lines — which is what makes a single log file enough to reconstruct "I
// clicked Export and got an error": the click, the request, the server's
// handling of it, and the stack, in order.
//
// Efficiency notes, since this runs inside the UI thread:
//   - A disabled call is one integer compare. No template literal in the
//     argument list is ever evaluated... which is exactly why fields go in an
//     object rather than being interpolated into the message.
//   - The ring is a fixed-size circular array. It never grows, so a long
//     session cannot leak memory through logging.
//   - Subscribers (the log panel) are notified on a timer, not per record, so a
//     burst of fifty lines costs one React render rather than fifty.
//   - Shipping is batched and uses `keepalive`, so a record produced during a
//     page unload still arrives.

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export const LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100,
};

export interface LogRecord {
  /** ISO timestamp. */
  t: string;
  level: Exclude<LogLevel, 'silent'>;
  /** Short module tag: 'api', 'store', 'ui'. */
  mod: string;
  msg: string;
  fields?: Record<string, unknown>;
  /** Monotonic within this page load — used as a React key and a merge cursor. */
  seq: number;
}

const RING_SIZE = 600;
const SHIP_BATCH = 25;
const SHIP_INTERVAL_MS = 2000;
const SHIP_QUEUE_MAX = 200;
const NOTIFY_INTERVAL_MS = 200;

// Persisted rather than compiled in, so turning on debug logging is a thing you
// do in the running app (the log panel has a control for it) rather than a
// rebuild. The env var is the default for someone who wants every session
// verbose.
const LEVEL_KEY = 'aps.logLevel';
const SHIP_LEVEL_KEY = 'aps.logShipLevel';

function readStored(key: string, fallback: LogLevel): LogLevel {
  try {
    const stored = localStorage.getItem(key);
    if (stored && stored in LEVELS) return stored as LogLevel;
  } catch {
    // Private mode / storage disabled. The default is fine.
  }
  return fallback;
}

const envLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined) ?? (import.meta.env.DEV ? 'debug' : 'info');

let level: LogLevel = readStored(LEVEL_KEY, envLevel in LEVELS ? envLevel : 'debug');
// Default 'info' rather than 'debug': every API call already produces a server
// line, so shipping the client's own debug echo of it would double the file for
// no new information. Warnings, errors and user-visible actions do go.
let shipLevel: LogLevel = readStored(SHIP_LEVEL_KEY, 'info');
let minLevel = LEVELS[level];

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

const ring: (LogRecord | undefined)[] = new Array(RING_SIZE);
let writes = 0;

/** Every record still held, oldest first. */
export function getRecords(): LogRecord[] {
  const out: LogRecord[] = [];
  for (let i = Math.max(0, writes - RING_SIZE); i < writes; i += 1) {
    const record = ring[i % RING_SIZE];
    if (record) out.push(record);
  }
  return out;
}

export function clearRecords(): void {
  ring.fill(undefined);
  notify();
}

// ---------------------------------------------------------------------------
// Subscribers (the in-app log panel)
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
let notifyTimer: number | undefined;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  if (!listeners.size || notifyTimer !== undefined) return;
  // Coalesced: a burst of records repaints the panel once.
  notifyTimer = window.setTimeout(() => {
    notifyTimer = undefined;
    for (const listener of listeners) listener();
  }, NOTIFY_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Shipping to the server
// ---------------------------------------------------------------------------

let shipQueue: LogRecord[] = [];
let shipTimer: number | undefined;
// After this many consecutive failures the client stops trying. The server
// being down is itself the thing being debugged in that case, and a retry loop
// firing every two seconds would bury the browser console in fetch errors.
let shipFailures = 0;
const SHIP_GIVE_UP_AFTER = 5;

function scheduleShip() {
  if (shipTimer !== undefined || !shipQueue.length) return;
  shipTimer = window.setTimeout(ship, SHIP_INTERVAL_MS);
}

function ship() {
  if (shipTimer !== undefined) {
    clearTimeout(shipTimer);
    shipTimer = undefined;
  }
  if (!shipQueue.length || shipFailures >= SHIP_GIVE_UP_AFTER) return;

  const batch = shipQueue;
  shipQueue = [];

  // Deliberately a raw fetch, not the app's api client: that one logs, and a
  // logger that logs its own delivery is a loop. Failures are counted, never
  // logged.
  fetch('/api/logs/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: batch }),
    keepalive: true,
  })
    .then((res) => {
      shipFailures = res.ok ? 0 : shipFailures + 1;
    })
    .catch(() => {
      shipFailures += 1;
    });
}

function queueForShipping(record: LogRecord) {
  if (LEVELS[record.level] < LEVELS[shipLevel] || shipLevel === 'silent') return;
  shipQueue.push(record);
  // Bound the queue: if the server is unreachable, drop the oldest rather than
  // grow without limit. The local ring still has them.
  if (shipQueue.length > SHIP_QUEUE_MAX) shipQueue = shipQueue.slice(-SHIP_QUEUE_MAX);
  if (shipQueue.length >= SHIP_BATCH) ship();
  else scheduleShip();
}

// A record produced as the tab closes — the error that made the user reload —
// is the one most worth keeping, so the queue is flushed on the way out.
// `pagehide` rather than `unload`, which is unreliable and blocks the bfcache.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!shipQueue.length) return;
    const body = JSON.stringify({ records: shipQueue });
    shipQueue = [];
    // sendBeacon survives the teardown that cancels an in-flight fetch.
    navigator.sendBeacon?.('/api/logs/client', new Blob([body], { type: 'application/json' }));
  });
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

const CONSOLE_METHOD: Record<Exclude<LogLevel, 'silent'>, 'debug' | 'info' | 'warn' | 'error'> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

const STYLES: Record<Exclude<LogLevel, 'silent'>, string> = {
  trace: 'color:#828ca3',
  debug: 'color:#22d3aa',
  info: 'color:#6c8eff',
  warn: 'color:#ffb454',
  error: 'color:#f2555c',
};

function writeConsole(record: LogRecord) {
  const args: unknown[] = [`%c${record.mod}%c ${record.msg}`, STYLES[record.level], 'color:inherit'];
  if (record.fields) args.push(record.fields);
  console[CONSOLE_METHOD[record.level]](...args);
}

// ---------------------------------------------------------------------------
// The logger
// ---------------------------------------------------------------------------

function emit(recordLevel: Exclude<LogLevel, 'silent'>, mod: string, msg: string, fields?: Record<string, unknown>) {
  const record: LogRecord = {
    t: new Date().toISOString(),
    level: recordLevel,
    mod,
    msg,
    fields,
    seq: writes,
  };

  ring[writes % RING_SIZE] = record;
  writes += 1;

  writeConsole(record);
  queueForShipping(record);
  notify();
}

export interface Logger {
  trace(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  enabled(level: LogLevel): boolean;
  /** Starts a timer; call the returned function to log the operation with `ms`. */
  start(msg: string, fields?: Record<string, unknown>): (level?: Exclude<LogLevel, 'silent'>, extra?: Record<string, unknown>) => number;
}

export function createLogger(mod: string): Logger {
  const make =
    (recordLevel: Exclude<LogLevel, 'silent'>) =>
    (msg: string, fields?: Record<string, unknown>) => {
      if (LEVELS[recordLevel] < minLevel) return;
      emit(recordLevel, mod, msg, fields);
    };

  const logger: Logger = {
    trace: make('trace'),
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    enabled: (check: LogLevel) => LEVELS[check] >= minLevel,
    start(msg, fields) {
      // performance.now() rather than Date.now(): sub-millisecond, and immune
      // to the wall clock being adjusted mid-operation.
      const began = performance.now();
      return (recordLevel = 'debug', extra) => {
        const ms = Math.round((performance.now() - began) * 100) / 100;
        logger[recordLevel](msg, { ...fields, ...extra, ms });
        return ms;
      };
    },
  };

  return logger;
}

export function getLevel(): LogLevel {
  return level;
}

export function setLevel(next: LogLevel): void {
  if (!(next in LEVELS)) return;
  level = next;
  minLevel = LEVELS[next];
  try {
    localStorage.setItem(LEVEL_KEY, next);
  } catch {
    // Not persisting is survivable; the level still applies to this session.
  }
  notify();
}

export function getShipLevel(): LogLevel {
  return shipLevel;
}

export function setShipLevel(next: LogLevel): void {
  if (!(next in LEVELS)) return;
  shipLevel = next;
  try {
    localStorage.setItem(SHIP_LEVEL_KEY, next);
  } catch {
    // As above.
  }
}

/** Sends anything queued immediately — used before downloading the log file. */
export function flushToServer(): void {
  shipFailures = 0;
  ship();
}

export const log = createLogger('app');

/**
 * Installs handlers for the errors nothing else catches.
 *
 * Without these, a render-time TypeError or a rejected promise in an event
 * handler reaches the browser console and nowhere else — invisible in the log
 * file, and gone as soon as the user closes devtools they were never going to
 * open.
 */
export function installGlobalErrorHandlers(): void {
  const global = createLogger('window');

  window.addEventListener('error', (event) => {
    // Resource errors (a failed <img>/<script> load) arrive on the same event
    // with no `error` object; they are worth a line but not a stack.
    global.error(event.message || 'script error', {
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    global.error('unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  log.info('client started', {
    url: location.pathname,
    level,
    shipLevel,
    // Which browser build produced a record matters the moment anything is
    // "only broken on my machine".
    ua: navigator.userAgent,
  });
}
