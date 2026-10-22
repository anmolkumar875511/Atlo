import {
  AppError,
  RepoNotFoundError,
  RepoTooLargeError,
  UpstreamError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from '../../lib/errors.js';

const CODELOAD = 'https://codeload.github.com';

// Downloads a repository as a zip from GitHub's codeload host. This is much faster
// than `git clone` because GitHub streams one ready-made archive.
export class GithubArchiveClient {
  constructor({ maxZipBytes, timeoutMs, token, fetchImpl = fetch }) {
    this.maxZipBytes = maxZipBytes;
    this.timeoutMs = timeoutMs;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async download(repo) {
    const refPath = (repo.ref ?? 'HEAD').split('/').map(encodeURIComponent).join('/');
    const url = `${CODELOAD}/${repo.owner}/${repo.name}/zip/${refPath}`;

    const headers = { 'User-Agent': 'atlo-codebase-explorer' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    try {
      const res = await this.fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 404) throw new RepoNotFoundError();
      if (res.status === 403 || res.status === 429) throw new UpstreamRateLimitedError();
      if (!res.ok) throw new UpstreamError(`GitHub responded with status ${res.status}.`);

      const declared = Number(res.headers.get('content-length'));
      if (declared > this.maxZipBytes) throw this.#tooLarge();

      return await this.#readBody(res);
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new UpstreamTimeoutError();
      }
      if (err instanceof AppError) throw err;
      throw new UpstreamError();
    }
  }

  // Reads the body chunk by chunk so a huge download is cut off early.
  async #readBody(res) {
    if (!res.body) throw new UpstreamError();
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > this.maxZipBytes) {
        await reader.cancel();
        throw this.#tooLarge();
      }
      chunks.push(value);
    }

    const out = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  #tooLarge() {
    const mb = Math.round(this.maxZipBytes / (1024 * 1024));
    return new RepoTooLargeError(`This repository is larger than the ${mb} MB download limit.`);
  }
}
