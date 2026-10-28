import { parentPort } from 'node:worker_threads';
import { FileAnalyzer } from './fileAnalyzer.js';

// Runs inside a worker thread. Each worker owns its parsers, created once on startup.
const analyzer = new FileAnalyzer();

parentPort.on('message', ({ id, files }) => {
  parentPort.postMessage({ id, results: files.map((file) => analyzer.safeAnalyze(file)) });
});
