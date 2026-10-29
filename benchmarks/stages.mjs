// Per-stage timings of the analysis pipeline, cold and then with a warm file cache.
//   node benchmarks/stages.mjs owner/repo [owner/repo ...]
import { loadConfig } from '../backend/src/config/env.js';
import { createContainer } from '../backend/src/container.js';
import { createLogger } from '../backend/src/lib/logger.js';
const c = createContainer({ config: loadConfig({NODE_ENV:'production',WORKER_THREADS:'0'}), logger: createLogger({level:'silent',env:'test'}) });
for (const r of process.argv.slice(2)) for (const pass of ['cold','again after snapshot cleared']) {
  const t=performance.now(); const {snapshot}=await c.controllers.analyze.service.analyze(r);
  console.log(r, pass, Math.round(performance.now()-t),'ms', JSON.stringify(snapshot.graph.stats.timings), 'hits', snapshot.graph.stats.cacheHits);
  c.controllers.analyze.service.snapshots.cache.clear();
}
