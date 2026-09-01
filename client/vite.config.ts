import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const buildId = new Date().toISOString();

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  resolve: {
    alias: {
      // course data + physics are shared with the SpacetimeDB module
      '@shared': fileURLToPath(new URL('../spacetimedb/src/shared', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    fs: { allow: ['..'] },
  },
});
