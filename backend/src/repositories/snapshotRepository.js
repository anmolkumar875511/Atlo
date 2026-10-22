import { snapshotId } from '../models/repoSnapshot.js';

// Storage boundary for snapshots. Today it wraps an in-memory LRU; swapping in
// SQLite or Redis later only changes this class, not the services above it.
export class SnapshotRepository {
  constructor(cache) {
    this.cache = cache;
  }

  findByRepo(repo) {
    return this.cache.get(snapshotId(repo));
  }

  findById(id) {
    return this.cache.get(id);
  }

  save(snapshot) {
    this.cache.set(snapshot.id, snapshot);
  }
}
