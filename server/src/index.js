import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
// one. Set API_PORT to change it — in the .env at the REPO ROOT, which is the
// only one `dotenv/config` above ever reads (it resolves .env against the
// working directory, and every way of starting this app runs from the root),
// or in your shell, which wins over the file. PORT is still honored as a
// fallback for platforms that only ever set that. scripts/studio.ps1 resolves
// the port the same way, in the same order, so the launcher always opens the
// port this actually binds.
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

// Serves the built client (`npm run build`) when it's present, so the whole
// app can run as one process on one port without the Vite dev server. Gated
// on the dist folder existing rather than NODE_ENV, so a plain `npm run
// dev:server` with a stale build still works and nothing breaks for anyone
// who never runs the build.
const serverSrc = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(serverSrc, '../..');
const clientDist = path.join(repoRoot, 'client/dist');
const clientIndex = path.join(clientDist, 'index.html');

// Monaco, served off disk instead of from a CDN — see client/src/lib/
// monacoSetup.ts for why. This is monaco-editor's own prebuilt AMD bundle
// (loader, editor, language workers), served verbatim: nothing builds it and
// nothing copies it, so the client build stays 4.5s instead of 45s.
//
// Two candidates because npm may hoist the package to the workspace root or
// leave it under client/. Resolved by looking rather than by `require.resolve`,
// which monaco's exports map blocks for package.json.
const monacoVsDir = [
  path.join(repoRoot, 'node_modules/monaco-editor/min/vs'),
  path.join(repoRoot, 'client/node_modules/monaco-editor/min/vs'),
].find((dir) => fs.existsSync(dir));

// Set by scripts/studio.ps1 when it runs `vite build --watch` alongside the
// server: the bundle on disk will change under a page that is already open, so
// index.html gets a few lines that poll for a new build and reload. Off by
// default — a plain `npm start` serves the file byte for byte, and this never
// touches anything but the HTML document itself.
const watchMode = process.env.STUDIO_WATCH === '1';

// Vite renames the hashed asset files on every meaningful rebuild, so the
// mtime of index.html alone is a sufficient build id.
const buildId = () => {
  try {
    return String(fs.statSync(clientIndex).mtimeMs);
  } catch {
    return null;
  }
};

// 2s, not 1s: a watch build takes ~2s anyway, so a faster poll cannot make the
// reload arrive sooner — it only doubles the request count against a server the
// launcher leaves running all day. `data.id === null` is the window where the
// watcher has emptied client/dist and not yet rewritten it; holding the last
// known id through it is what stops a rebuild from looking like a change.
const reloadSnippet = `
<script>
(function () {
  var current = null;
  setInterval(function () {
    fetch('/api/build-id').then(function (r) { return r.json(); }).then(function (data) {
      if (data.id === null) return;
      if (current === null) { current = data.id; return; }
      if (data.id !== current) location.reload();
    }).catch(function () {});
  }, 2000);
})();
</script>
`;

const sendIndex = (req, res, next) => {
  if (!watchMode) {
    res.sendFile(clientIndex);
    return;
  }
  fs.readFile(clientIndex, 'utf8', (err, html) => {
    if (err) {
      next(err);
      return;
    }
    // A rebuild can catch us between Vite emptying dist and writing the new
    // index.html; appending rather than requiring a </body> match means the
    // page still loads if the document is ever not what we expect.
    res.type('html').send(html.includes('</body>')
      ? html.replace('</body>', `${reloadSnippet}</body>`)
      : html + reloadSnippet);
  });
};

// Ahead of the SPA fallback below, which would otherwise answer /vs/loader.js
// with index.html and leave the editor failing on a syntax error. Mounted
// whether or not client/dist exists, so `npm run dev` (which proxies /vs here)
// works without a build. Left on express.static's default caching: these files
// are immutable for a given monaco-editor version but their URLs are not
// versioned, so a revalidation per load is the honest trade — and it costs
// about a millisecond each over loopback.
if (monacoVsDir) {
  app.use('/vs', express.static(monacoVsDir));
} else {
  log.warn('monaco-editor not found on disk — the code editors will not load', {
    looked: ['node_modules/monaco-editor/min/vs', 'client/node_modules/monaco-editor/min/vs'],
  });
}

if (fs.existsSync(clientIndex)) {
  if (watchMode) {
    app.get('/api/build-id', (req, res) => res.json({ id: buildId() }));
    // Ahead of express.static, which would otherwise answer `/` with the
    // unmodified file and leave that one page unable to notice a rebuild.
    app.get('/', sendIndex);
  }
  app.use(express.static(clientDist));
  // SPA fallback for client-side routes — but never swallow an unmatched
  // /api/* request into index.html, or a typo'd endpoint would "succeed"
  // with an HTML body instead of a 404.
  app.get(/^(?!\/api).*/, sendIndex);
}

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
    console.error(`Set API_PORT to a different value (in the .env at the repo root, or your shell) and retry.\n`);
    flushSync();
    process.exit(1);
  }
  throw err;
});
