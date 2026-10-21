import { createHash } from 'node:crypto';
import { buildFileTree, countDirs } from './fileTree.js';

// Everything we know about one analyzed repository.
// from here to parse imports, so a repo is downloaded only once.

// Deterministic id: the same repo and ref always map to the same snapshot id.
export function snapshotId(repo) {
  const key = `${repo.owner}/${repo.name}@${repo.ref ?? 'HEAD'}`.toLowerCase();
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

export function createSnapshot({ repo, extraction, ingestMs, now = Date.now() }) {
  const { files, skipped, truncated } = extraction;
  const tree = buildFileTree(repo.name, files);

  return {
    id: snapshotId(repo),
    repo,
    tree,
    contents: new Map(files.map((f) => [f.path, f.content])),
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
