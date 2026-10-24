import { FileNotFoundError, SnapshotNotFoundError } from '../lib/errors.js';
import { buildFileDetails } from '../models/fileDetails.js';
import { searchIndex } from '../models/searchIndex.js';

// Read-only questions about an analysis that is already in the cache.
export class RepoQueryService {
  constructor({ snapshotRepository }) {
    this.snapshots = snapshotRepository;
  }

  #snapshot(id) {
    const snapshot = this.snapshots.findById(id);
    if (!snapshot) throw new SnapshotNotFoundError();
    return snapshot;
  }

  getFile(id, path) {
    const details = buildFileDetails(this.#snapshot(id), path);
    if (!details) throw new FileNotFoundError(path);
    return details;
  }

  search(id, query, limit) {
    return searchIndex(this.#snapshot(id).searchIndex, query, limit);
  }
}
