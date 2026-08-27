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
// Matches the 20mb raw zip-upload limit used by the import routes — a
// proxy/shared-flow JSON payload (sent whole to /bundle and
// /sharedflow-bundle for preview/lint/export) embeds every policy's full XML
// plus any resource file content, so it can get just as large as the bundle
// it came from.
app.use(express.json({ limit: '20mb' }));

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

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Bound to loopback explicitly, not 0.0.0.0. This API is unauthenticated and
// it writes files and spawns the apigeelint subprocess, so it must not be
// reachable from the LAN. Declining CORS (above) only stops *browser* pages on
// other origins; it does nothing about a direct request from another host.
const HOST = process.env.API_HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  console.log(`Apigee Proxy Studio API listening on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use — is another "npm run dev:server" already running?`);
    console.error(`Set API_PORT to a different value (in server/.env or your shell) and retry.\n`);
    process.exit(1);
  }
  throw err;
});
