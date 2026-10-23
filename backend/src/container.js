import { AnalyzeController } from './controllers/analyze.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { LruCache } from './lib/lruCache.js';
import { SnapshotRepository } from './repositories/snapshotRepository.js';
import { GithubArchiveClient } from './services/ingest/githubArchiveClient.js';
import { ImportExtractor } from './services/parser/importExtractor.js';
import { TreeSitterParser } from './services/parser/treeSitterParser.js';
import { RepoAnalysisService } from './services/repoAnalysisService.js';
import { SourceAnalysisService } from './services/sourceAnalysisService.js';

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

  const sourceAnalysis = new SourceAnalysisService({
    importExtractor: new ImportExtractor({ parser: new TreeSitterParser() }),
    logger,
  });

  const repoAnalysisService = new RepoAnalysisService({
    archiveClient,
    sourceAnalysis,
    snapshotRepository,
    limits: config.limits,
    logger,
  });

  return {
    controllers: {
      analyze: new AnalyzeController({ repoAnalysisService }),
      health: new HealthController(),
    },
  };
}
