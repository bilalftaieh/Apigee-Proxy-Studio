import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The one .env the whole app reads, at the repo root — the same file the
// server loads (see .env.example, and server/src/index.js). Resolved from this
// file's own location rather than process.cwd(): the cwd is the root for every
// documented command, but anchoring it means a `vite` run from client/ cannot
// quietly start reading a different file and disagree with the server about
// the port.
//
// Empty prefix so the vars need no VITE_ prefix — these are read here at
// config load time in Node, not exposed to browser code. Naming them
// explicitly (rather than the generic PORT) avoids collisions with tools that
// inject their own PORT for whatever they consider "the" dev server.
//
// loadEnv already gives an actual environment variable precedence over the
// file, which is dotenv's rule and the one scripts/studio.ps1 follows too.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, repoRoot, '') };
  const clientPort = Number(env.CLIENT_PORT) || 5173;
  const apiPort = Number(env.API_PORT) || 4310;

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      // Fail loudly if the port is taken instead of silently moving to the
      // next free one — a moved port is easy to miss and easy to debug the
      // wrong process against.
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        // Monaco's prebuilt bundle, which the API server serves off disk rather
        // than anyone bundling it (see src/lib/monacoSetup.ts). Proxied for the
        // same reason /api is: the app asks for it by relative path, so in dev
        // it has to reach the same place it reaches in a built app.
        '/vs': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
