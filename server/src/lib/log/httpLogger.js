// Express middleware: one line per request, and a request id that ties
// everything else together.
//
// The id is the point. Every log line produced while handling a request carries
// the same `reqId`, the response carries it in an `x-request-id` header, and the
// browser records it against its own call — so a user saying "the export failed"
// turns into a single grep that returns the client's attempt, the server's
// handling of it, the apigeelint subprocess it spawned and the stack that ended
// it, in order.
//
// Cost per request: one hrtime read, one 'finish' listener, one record. Bodies
// are never read or buffered here — sizes only.

import { randomBytes } from 'crypto';
import { createLogger, LEVELS } from './logger.js';

const log = createLogger('http');

// Requests slower than this are worth a second look even when they succeed.
// A lint run legitimately takes seconds, so this is not an error — it is a
// marker to find in the file when someone says the app feels slow.
const SLOW_MS = Number.parseInt(process.env.LOG_SLOW_MS || '', 10) || 1500;

// The viewer polls /api/logs continuously. Logging those requests would mean
// every poll produces a record, which the next poll then fetches and displays —
// a feedback loop that buries real lines under its own noise. They are the one
// thing this middleware stays quiet about.
const SILENT_PATHS = /^\/api\/logs(\/|$)/;

// Health checks are frequent and uninteresting, but not invisible: kept at
// trace so they are there if you go looking for whether the client could reach
// the server at all.
const TRACE_PATHS = /^\/api\/health$/;

let counter = 0;
const PROCESS_TAG = randomBytes(2).toString('hex');

/**
 * Short, unique-enough ids: a per-process random tag plus a counter. Ten
 * characters that stay readable in a terminal, rather than a 36-character uuid
 * that wraps the line — this is a single-process local server, not a fleet.
 */
function nextRequestId() {
  counter = (counter + 1) % 0xffffff;
  return `${PROCESS_TAG}${counter.toString(36).padStart(4, '0')}`;
}

function levelFor(status, ms) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  if (ms >= SLOW_MS) return 'warn';
  return 'info';
}

export function requestLogger() {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    // An id supplied by the caller wins, so a browser that already logged its
    // own attempt under some id can have the server's lines filed under the
    // same one.
    const id = String(req.headers['x-request-id'] || '').slice(0, 40) || nextRequestId();

    req.id = id;
    // Route handlers log through this: it stamps reqId on every line without
    // each one having to remember to.
    req.log = log.child({ reqId: id });
    res.setHeader('x-request-id', id);

    const silent = SILENT_PATHS.test(req.path);
    const baseLevel = TRACE_PATHS.test(req.path) ? 'trace' : null;

    if (!silent) {
      // A start line at trace level is what tells you a request that never
      // produced a finish line existed at all — the signature of a hang.
      req.log.trace(`${req.method} ${req.originalUrl}`, {
        reqBytes: Number(req.headers['content-length']) || undefined,
      });
    }

    // Routes answer a rejected request with `res.status(4xx).json({ error })`
    // and handle it entirely themselves — no throw, so the error handler below
    // never sees it and the message is lost the moment it is serialized. That
    // message is the single most useful field in the log, so it is picked off
    // here rather than by editing forty route handlers to log it themselves.
    // The wrapper costs one closure per request and reads one property.
    let failure;
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400 && typeof body?.error === 'string') failure = body.error;
      return json(body);
    };

    let done = false;
    const finish = (aborted) => {
      if (done || silent) return;
      done = true;

      const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100;
      const status = res.statusCode;
      const level = aborted ? 'warn' : baseLevel || levelFor(status, ms);

      req.log[level](`${req.method} ${req.originalUrl} ${aborted ? 'aborted' : status}`, {
        status: aborted ? undefined : status,
        ms,
        // Set by the routes that stream or buffer a body themselves (the zip
        // exports); absent for ordinary res.json() responses, where it is not
        // worth the bookkeeping.
        bytes: Number(res.getHeader('content-length')) || undefined,
        reqBytes: Number(req.headers['content-length']) || undefined,
        slow: !aborted && ms >= SLOW_MS ? true : undefined,
        error: failure,
      });
    };

    res.on('finish', () => finish(false));
    // 'close' before 'finish' means the client hung up — a cancelled export, a
    // page reload mid-lint. Worth a line, because from the UI's side it looks
    // identical to a request that failed.
    res.on('close', () => {
      if (!done && !res.writableEnded) finish(true);
    });

    next();
  };
}

/**
 * The terminal error handler.
 *
 * Logs the stack with the request id, then returns that id to the caller. The
 * client shows it on the error toast, so "it failed" from a user comes with the
 * exact line to search for.
 */
export function errorLogger() {
  return (err, req, res, next) => {
    const logger = req.log || log;
    logger.error(`unhandled error in ${req.method} ${req.originalUrl}`, { err });

    if (res.headersSent) {
      // Too late to change the response — Express's default handler closes it.
      return next(err);
    }

    // Errors that carry their own 4xx are about the request, not about us:
    // body-parser's "Unexpected token" and its 413 for an oversized payload
    // both land here, and answering those with "Internal server error" tells
    // the user nothing and sends them looking in the wrong place. A 5xx keeps
    // the generic message — its detail is in the log, under this request id.
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({
      error: status === 500 ? 'Internal server error' : err.message,
      requestId: req.id,
    });
  };
}

/**
 * Turns a crash into a record before the process goes.
 *
 * Without this an uncaught rejection prints a bare stack to a terminal nobody
 * was watching and leaves nothing in the file — the exact failure you most need
 * a log for.
 */
export function installCrashHandlers(flushSync) {
  process.on('uncaughtException', (err) => {
    log.fatal('uncaught exception — exiting', { err });
    flushSync();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    // Not fatal: Node's default for an unhandled rejection is to terminate, but
    // in this app they come from fire-and-forget cleanup paths where the server
    // is still perfectly able to serve the next request. Recorded loudly rather
    // than acted on.
    log.error('unhandled promise rejection', {
      err: reason instanceof Error ? reason : new Error(String(reason)),
    });
  });
}

export { LEVELS };
