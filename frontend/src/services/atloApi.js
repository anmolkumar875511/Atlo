import { API_PREFIX } from '../constants/api.js';
import { request } from './http.js';

export async function analyzeRepository(url, { signal } = {}) {
  const payload = await request(`${API_PREFIX}/analyze`, {
    method: 'POST',
    body: { url },
    signal,
  });
  return payload.data;
}

// GET /api/repos/:id/files?path=...
export async function fetchFile(snapshotId, path, { signal } = {}) {
  const query = new URLSearchParams({ path });
  const payload = await request(`${API_PREFIX}/repos/${snapshotId}/files?${query}`, { signal });
  return payload.data;
}

// GET /api/repos/:id/search?q=...
export async function searchRepo(snapshotId, q, { signal } = {}) {
  const query = new URLSearchParams({ q, limit: '20' });
  const payload = await request(`${API_PREFIX}/repos/${snapshotId}/search?${query}`, { signal });
  return payload.data.results;
}

// GET /api/repos/:id/health  (the first call reads git history, so it can take a few seconds)
export async function fetchHealth(snapshotId, { signal } = {}) {
  const payload = await request(`${API_PREFIX}/repos/${snapshotId}/health`, { signal });
  return payload.data;
}
