import 'dotenv/config';
import express from 'express';
import policyTypesRouter from './routes/policyTypes.js';
import policyChainsRouter from './routes/policyChains.js';
import proxiesRouter from './routes/proxies.js';
import templatesRouter from './routes/templates.js';
import bundleRouter from './routes/bundle.js';
import lintRouter from './routes/lint.js';
import sharedFlowsRouter from './routes/sharedFlows.js';
import sharedFlowBundleRouter from './routes/sharedFlowBundle.js';
import proxyImportRouter from './routes/proxyImport.js';
import testRunRouter from './routes/testRun.js';
import workspaceRouter from './routes/workspace.js';
import aiRouter from './routes/ai.js';
import logsRouter from './routes/logs.js';
import { config as logConfig, flushSync, installExitFlush, log } from './lib/log/logger.js';
import { errorLogger, installCrashHandlers, requestLogger } from './lib/log/httpLogger.js';

// Before anything else can throw: a crash during startup is exactly the one
// worth having in the file, and buffered lines have to survive the exit.
installCrashHandlers(flushSync);
installExitFlush();

const app = express();
// API_PORT is scoped to this app on purpose — the generic PORT env var is
// commonly injected by editors, launchers and deploy platforms for whatever
// process THEY consider "the" server, which can silently collide with this
// one. Set API_PORT (in server/.env or your shell) to change it; PORT is
// still honored as a fallback for platforms that only ever set that.
const PORT = process.env.API_PORT || process.env.PORT || 4310;

// No CORS middleware on purpose: the client only ever calls the relative
// `/api` path, which Vite's dev server proxies to this port same-origin
// (see client/vite.config.ts). Enabling cross-origin access here would let
// any web page open in the user's browser reach this unauthenticated local
// API directly.

// First, ahead of the body parser: a request that dies in express.json —
// malformed JSON, or a 20mb payload one byte over the limit — still gets an id
// and still produces a request line, which is the case you most need one for.
app.use(requestLogger());

// Matches the 20mb raw zip-upload limit used by the import routes — a
// proxy/shared-flow JSON payload (sent whole to /bundle and
// /sharedflow-bundle for preview/lint/export) embeds every policy's full XML
// plus any resource file content, so it can get just as large as the bundle
// it came from.
app.use(express.json({ limit: '20mb' }));

app.use('/api', logsRouter);
app.use('/api', policyTypesRouter);
app.use('/api', policyChainsRouter);
app.use('/api', proxiesRouter);
app.use('/api', templatesRouter);
app.use('/api', bundleRouter);
app.use('/api', lintRouter);
app.use('/api', sharedFlowsRouter);
app.use('/api', sharedFlowBundleRouter);
app.use('/api', proxyImportRouter);
app.use('/api', testRunRouter);
app.use('/api', workspaceRouter);
app.use('/api', aiRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Logs the stack against the request id and returns that id to the caller, so
// the toast the user is looking at names the line to search for.
app.use(errorLogger());

// Bound to loopback explicitly, not 0.0.0.0. This API is unauthenticated and
// it writes files and spawns the apigeelint subprocess, so it must not be
// reachable from the LAN. Declining CORS (above) only stops *browser* pages on
// other origins; it does nothing about a direct request from another host.
const HOST = process.env.API_HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  console.log(`Apigee Proxy Studio API listening on http://${HOST}:${PORT}`);
  // The startup line records the configuration the rest of the file has to be
  // read against — a session logged at level info looks like a session with a
  // bug until you can see that debug was simply off.
  log.info('server started', {
    url: `http://${HOST}:${PORT}`,
    node: process.version,
    pid: process.pid,
    consoleLevel: logConfig.consoleLevel,
    fileLevel: logConfig.fileLevel,
    logFile: logConfig.toFile ? logConfig.dir : false,
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.fatal('port already in use', { port: PORT });
    console.error(`\nPort ${PORT} is already in use — is another "npm run dev:server" already running?`);
    console.error(`Set API_PORT to a different value (in server/.env or your shell) and retry.\n`);
    flushSync();
    process.exit(1);
  }
  throw err;
});
