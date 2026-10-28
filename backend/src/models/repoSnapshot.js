import { createHash } from 'node:crypto';
import { buildFileTree, countDirs } from './fileTree.js';
import { buildSearchIndex } from './searchIndex.js';

// Everything we know about one analyzed repository. Phase 2 reads `contents`
// from here to parse imports, so a repo is downloaded only once.

// Deterministic id: the same repo and ref always map to the same snapshot id.
export function snapshotId(repo) {
  const key = `${repo.owner}/${repo.name}@${repo.ref ?? 'HEAD'}`.toLowerCase();
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

export function createSnapshot({ repo, extraction, analysis, ingestMs, now = Date.now() }) {
  const { files, skipped, truncated } = extraction;
  const { graph, fileAnalyses, onboarding, callLinks, calledBy } = analysis;
  const tree = buildFileTree(repo.name, files);

  // path -> files that import it, for the code panel's "imported by" list
  const importedBy = new Map();
  for (const edge of graph.edges) {
    if (!importedBy.has(edge.target)) importedBy.set(edge.target, []);
    importedBy.get(edge.target).push(edge.source);
  }

  return {
    id: snapshotId(repo),
    repo,
    tree,
    graph,
    files: new Map(
      files.map((f) => [f.path, { name: f.name, size: f.size, language: f.language }]),
    ),
    contents: new Map(files.map((f) => [f.path, f.content])),
    analyses: fileAnalyses,
    onboarding,
    callLinks,
    calledBy,
    health: null, // filled in on demand by HealthService
    importedBy,
    searchIndex: buildSearchIndex({ files, analyses: fileAnalyses }),
    stats: {
      files: tree.fileCount,
      dirs: countDirs(tree),
      totalBytes: tree.size,
      skipped,
      truncated,
      ingestMs,
    },
    createdAt: now,
  };
}
