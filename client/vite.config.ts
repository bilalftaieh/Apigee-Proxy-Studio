import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// CLIENT_PORT / API_PORT are read here (config load time, Node context) via
// loadEnv with an empty prefix so a client/.env file works without needing
// the VITE_ prefix Vite requires for vars exposed to browser code. Naming
// them explicitly (rather than the generic PORT) avoids collisions with
// tools that inject their own PORT env var for whatever they consider "the"
// dev server — see server/.env.example for the matching API_PORT note.
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
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
      },
    },
  };
});
