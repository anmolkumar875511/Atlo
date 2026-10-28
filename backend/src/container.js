import { AnalyzeController } from './controllers/analyze.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { RepoController } from './controllers/repo.controller.js';
import { LruCache } from './lib/lruCache.js';
import { SnapshotRepository } from './repositories/snapshotRepository.js';
import { GitChurnClient } from './services/churn/gitChurnClient.js';
import { HealthService } from './services/healthService.js';
import { GithubArchiveClient } from './services/ingest/githubArchiveClient.js';
import { AnalysisRunner } from './services/parser/analysisRunner.js';
import { FileAnalyzer } from './services/parser/fileAnalyzer.js';
import { WorkerPool } from './services/parser/workerPool.js';
import { RepoAnalysisService } from './services/repoAnalysisService.js';
import { RepoQueryService } from './services/repoQueryService.js';
import { SourceAnalysisService } from './services/sourceAnalysisService.js';

const WORKER_URL = new URL('./services/parser/parseWorker.js', import.meta.url);

// Composition root: the only file that knows how the pieces are wired together.
// Tests pass `overrides` (e.g. a fake archive client) instead of mocking modules.
export function createContainer({ config, logger, overrides = {} }) {
  const archiveClient =
    overrides.archiveClient ??
    new GithubArchiveClient({
      maxZipBytes: config.limits.maxZipBytes,
      timeoutMs: config.downloadTimeoutMs,
      token: config.githubToken,
    });

  const snapshotRepository = new SnapshotRepository(
    new LruCache({ maxEntries: config.cache.maxEntries, ttlMs: config.cache.ttlMs }),
  );

  // Worker threads start lazily, on the first repository big enough to need them.
  const pool =
    config.workers.count > 0
      ? new WorkerPool({ size: config.workers.count, workerUrl: WORKER_URL, logger })
      : null;
  const runner = new AnalysisRunner({
    analyzer: new FileAnalyzer(),
    pool,
    minFilesForPool: config.workers.minFiles,
    logger,
  });
  const sourceAnalysis = new SourceAnalysisService({ runner, logger });

  const repoAnalysisService = new RepoAnalysisService({
    archiveClient,
    sourceAnalysis,
    snapshotRepository,
    limits: config.limits,
    logger,
  });

  const churnClient =
    overrides.churnClient ??
    (config.churn.enabled
      ? new GitChurnClient({
          timeoutMs: config.churn.timeoutMs,
          windowDays: config.churn.windowDays,
        })
      : null);
  const healthService = new HealthService({ snapshotRepository, churnClient, logger });

  return {
    controllers: {
      analyze: new AnalyzeController({ repoAnalysisService }),
      repo: new RepoController({
        repoQueryService: new RepoQueryService({ snapshotRepository }),
        healthService,
      }),
      health: new HealthController(),
    },
    // Called on shutdown: stops the parse workers.
    dispose: () => pool?.destroy(),
  };
}
