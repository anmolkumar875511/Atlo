import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PROXY = { '/api': { target: 'http://localhost:4000', changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  // The graph chunk (Cytoscape) is large on purpose and only loads when a graph is shown.
  build: { chunkSizeWarningLimit: 700 },
  // In dev (and in `vite preview`), "/api" is forwarded to the Express server, so the browser
  // never sees CORS. `preview` serves the production build, which is what to measure speed on.
  server: { port: 5173, proxy: API_PROXY },
  preview: { port: 4173, proxy: API_PROXY },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // The logic: pure models, services and reducers. React hooks and views are exercised by the
      // browser run in benchmarks/ui_latency.py rather than by unit tests.
      include: ['src/models/**', 'src/services/**', 'src/controllers/*Reducer.js'],
      exclude: ['src/**/*.test.js', 'src/workers/**'],
      thresholds: { statements: 90, branches: 90, functions: 85, lines: 90 },
    },
  },
});
