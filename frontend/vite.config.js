import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The graph chunk (Cytoscape) is large on purpose and only loads when a graph is shown.
  build: { chunkSizeWarningLimit: 700 },
  server: {
    port: 5173,
    // In dev, "/api" is forwarded to the Express server, so the browser never sees CORS.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
