import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            // index.js only starts the server. parseWorker.js runs on another thread, which the coverage
            // tool cannot see; workerPool.test.js proves it works by comparing its output with inline.
            exclude: ['src/index.js', 'src/services/parser/parseWorker.js'],
            // A floor, not a goal: a drop below these fails `npm run coverage` (and CI).
            thresholds: { statements: 95, branches: 88, functions: 93, lines: 95 },
        },
    },
});
