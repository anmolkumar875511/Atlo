import { snapshotId, createSnapshot } from '../models/repoSnapshot.js';
import { extractSourceFiles } from './ingest/archiveExtractor.js';
import { parseGithubUrl } from './ingest/githubUrl.js';

// Orchestrates ingestion: parse URL -> (cache?) -> download -> unzip -> parse imports -> graph.
// Later phases append stages here (metrics, algorithms) without touching controllers or routes.
export class RepoAnalysisService {
  constructor({ archiveClient, sourceAnalysis, snapshotRepository, limits, logger }) {
    this.archiveClient = archiveClient;
    this.sourceAnalysis = sourceAnalysis;
    this.snapshots = snapshotRepository;
    this.limits = limits;
    this.logger = logger;
    this.inFlight = new Map();
  }

  async analyze(url) {
    const repo = parseGithubUrl(url);

    const hit = this.snapshots.findByRepo(repo);
    if (hit) {
      this.logger.info({ repo: `${repo.owner}/${repo.name}` }, 'snapshot cache hit');
      return { snapshot: hit, cached: true };
    }

    // If two people request the same repo at once, share one download.
    const key = snapshotId(repo);
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.#ingest(repo).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    return { snapshot: await pending, cached: false };
  }

  async #ingest(repo) {
    const started = performance.now();
    const zip = await this.archiveClient.download(repo);
    const extraction = extractSourceFiles(zip, this.limits);
    const ingestMs = Math.round(performance.now() - started);

    const graph = await this.sourceAnalysis.analyze(extraction.files);

    const snapshot = createSnapshot({ repo, extraction, graph, ingestMs });
    this.snapshots.save(snapshot);

    this.logger.info(
      {
        repo: `${repo.owner}/${repo.name}`,
        files: snapshot.stats.files,
        ingestMs,
        parseMs: graph.stats.parseMs,
        edges: graph.stats.edges,
      },
      'repository ingested',
    );
    return snapshot;
  }
}
