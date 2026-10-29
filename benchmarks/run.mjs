// Benchmark: cold analysis time per repository, then the cached time.
//   node benchmarks/run.mjs expressjs/express vuejs/core facebook/react
// Optional: WORKER_THREADS=0|auto|N   (default auto). Needs internet and `npm install` in backend/.
import { availableParallelism, cpus, totalmem } from 'node:os';
import { loadConfig } from '../backend/src/config/env.js';
import { createContainer } from '../backend/src/container.js';
import { createLogger } from '../backend/src/lib/logger.js';

const repos = process.argv.slice(2);
if (repos.length === 0) {
  console.error('Usage: node benchmarks/run.mjs owner/repo [owner/repo ...]');
  process.exit(1);
}

const config = loadConfig({
  NODE_ENV: 'production',
  LOG_LEVEL: 'silent',
  WORKER_THREADS: process.env.WORKER_THREADS ?? 'auto',
});
const container = createContainer({ config, logger: createLogger({ level: 'silent', env: 'test' }) });
const service = container.controllers.analyze.service;

console.log(`Machine: ${cpus()[0].model}, ${availableParallelism()} threads, ${(totalmem() / 2 ** 30).toFixed(1)} GB RAM`);
console.log(`Node ${process.version}, parse workers: ${config.workers.count}\n`);
console.log('| Repo | Code files | Edges | Cycles | Download+unzip | Parse+analyze | Cold total | Cached | Heap |');
console.log('|---|---|---|---|---|---|---|---|---|');

for (const repo of repos) {
  const t0 = performance.now();
  const { snapshot } = await service.analyze(repo);
  const cold = Math.round(performance.now() - t0);
  const t1 = performance.now();
  await service.analyze(repo);
  const cached = Math.round(performance.now() - t1);
  const g = snapshot.graph.stats;
  const heap = Math.round(process.memoryUsage().heapUsed / 2 ** 20);
  console.log(
    `| ${repo} | ${g.nodes} | ${g.edges} | ${g.cycles} | ${snapshot.stats.ingestMs} ms | ${g.parseMs} ms | ${cold} ms | ${cached} ms | ${heap} MB |`,
  );
}
await container.dispose();
