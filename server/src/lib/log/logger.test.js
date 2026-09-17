// Run with: npm run test:logging
//
// The tests worth having here are the ones about what a logger must never do:
// write a secret, write unboundedly, throw, or lose the last lines before a
// crash. The formatting can be checked by looking at it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Config is read at module load, so the environment has to be set before the
// import — hence the dynamic import rather than a static one.
const LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'aps-log-test-'));
process.env.LOG_DIR = LOG_DIR;
process.env.LOG_LEVEL = 'silent';
// Opting back in: file logging defaults OFF under the test runner so other
// suites don't append to the real log, and this suite is the one that has to
// read what was written.
process.env.LOG_TO_FILE = 'true';
process.env.LOG_FILE_LEVEL = 'trace';
process.env.LOG_MAX_BYTES = '2048';
process.env.LOG_MAX_FILES = '3';
process.env.GEMINI_API_KEY = 'AQ.test-key-value-that-must-never-be-logged';

const { createLogger, flushSync, readRing, setLevels, ingestExternal, LOG_FILE } = await import('./logger.js');
const { sanitize, scrubString } = await import('./redact.js');

const log = createLogger('test');

function logLines() {
  flushSync();
  return readFileSync(LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('a field whose name means "secret" is never written, at any depth', () => {
  log.info('creds', { apiKey: 'plain-value', nested: { authorization: 'Bearer abc123def456' } });
  const record = logLines().at(-1);
  assert.equal(record.apiKey, '[redacted]');
  assert.equal(record.nested.authorization, '[redacted]');
  assert.ok(!JSON.stringify(record).includes('plain-value'));
});

test('the configured API key is scrubbed even from an innocent-looking string', () => {
  log.info(`calling with key ${process.env.GEMINI_API_KEY} now`, {
    detail: `url?key=${process.env.GEMINI_API_KEY}`,
  });
  const record = logLines().at(-1);
  assert.ok(!record.msg.includes('test-key-value'), 'message still carries the key');
  assert.ok(!record.detail.includes('test-key-value'), 'field still carries the key');
  assert.match(record.msg, /\[redacted\]/);
});

test('bearer tokens inside free text are scrubbed', () => {
  assert.match(scrubString('sent Authorization: Bearer eyJhbGciOiJIUzI1NiJ9'), /\[redacted\]/);
});

test('records are bounded: depth, array length and string length all cap', () => {
  const limits = { maxDepth: 2, maxString: 10, maxArray: 2, maxKeys: 60 };
  const deep = { a: { b: { c: { d: 'too deep' } } } };
  assert.equal(sanitize(deep, limits).a.b, '[object]');
  assert.deepEqual(sanitize([1, 2, 3, 4], limits), [1, 2, '…+2 more']);
  assert.match(sanitize('x'.repeat(50), limits), /^x{10}…\+40 chars$/);
});

test('a cyclic object logs rather than hanging the server', () => {
  const cyclic = { name: 'proxy' };
  cyclic.self = cyclic;
  log.info('cyclic', { cyclic });
  assert.equal(logLines().at(-1).cyclic.self, '[circular]');
});

test('an Error field keeps message, stack, code and cause', () => {
  const inner = new Error('disk is full');
  inner.code = 'ENOSPC';
  log.error('save failed', { err: new Error('could not save', { cause: inner }) });
  const { err } = logLines().at(-1);
  assert.equal(err.message, 'could not save');
  assert.ok(err.stack.includes('logger.test.js'));
  assert.equal(err.cause.code, 'ENOSPC');
});

test('the level gate stops a disabled call before it reaches any sink', () => {
  setLevels({ fileLevel: 'warn' });
  const before = logLines().length;
  log.debug('should not appear');
  assert.equal(logLines().length, before);
  assert.equal(log.enabled('debug'), false);
  assert.equal(log.enabled('error'), true);
  setLevels({ fileLevel: 'trace' });
});

test('child bindings are stamped on every record from that logger', () => {
  createLogger('test').child({ reqId: 'r-42' }).info('with binding');
  assert.equal(logLines().at(-1).reqId, 'r-42');
});

test('start() reports a duration', () => {
  const done = createLogger('test').start('unit of work');
  done('info', { ok: true });
  const record = logLines().at(-1);
  assert.equal(typeof record.ms, 'number');
  assert.equal(record.ok, true);
});

test('the ring answers a cursor query with only what is new', () => {
  const { cursor } = readRing({});
  log.info('after the cursor');
  const next = readRing({ after: cursor });
  assert.equal(next.records.length, 1);
  assert.equal(next.records[0].msg, 'after the cursor');
});

test('the ring filters by level and by substring', () => {
  log.error('a distinctive failure');
  log.debug('a distinctive detail');
  assert.equal(readRing({ level: 'error', q: 'distinctive' }).records.length, 1);
  assert.equal(readRing({ level: 'trace', q: 'distinctive' }).records.length, 2);
});

test('client records land in the same ring and file, tagged as client', () => {
  ingestExternal({ level: 'warn', mod: 'api', msg: 'browser side', fields: { status: 502 } });
  const record = logLines().at(-1);
  assert.equal(record.src, 'client');
  assert.equal(record.status, 502);
  // A browser claiming a level we do not have must not produce an unfilterable
  // record — it is filed as info rather than trusted.
  ingestExternal({ level: 'not-a-level', mod: 'api', msg: 'bad level' });
  assert.equal(logLines().at(-1).l, 'info');
});

test('the file rotates at the size cap and keeps a bounded number of files', () => {
  for (let i = 0; i < 200; i += 1) log.info(`rotation filler ${i}`, { padding: 'x'.repeat(100) });
  flushSync();
  assert.ok(existsSync(`${LOG_FILE}.1`), 'rotation never happened');
  assert.ok(!existsSync(`${LOG_FILE}.${Number(process.env.LOG_MAX_FILES) + 1}`), 'kept more files than LOG_MAX_FILES');
});

test('a logger whose directory is unwritable does not throw', () => {
  // A file where the log directory should be: every write fails from here on.
  const blockedDir = path.join(LOG_DIR, 'blocked');
  writeFileSync(blockedDir, 'not a directory');
  process.env.LOG_DIR = path.join(blockedDir, 'nested');
  const url = new URL('./logger.js', import.meta.url);
  // A fresh module instance, since config is read once at load.
  return import(`${url}?blocked=1`).then((fresh) => {
    const blocked = fresh.createLogger('blocked');
    assert.doesNotThrow(() => {
      blocked.error('still works');
      fresh.flushSync();
    });
    // The ring is unaffected by the file being unavailable — the in-app viewer
    // keeps working when disk logging cannot.
    assert.equal(fresh.readRing({ q: 'still works' }).records.length, 1);
  });
});
