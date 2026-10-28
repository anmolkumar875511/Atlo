import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../models/apiError.js';
import { analyzeRepository, fetchFile, fetchHealth, searchRepo } from './atloApi.js';

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (impl) => vi.stubGlobal('fetch', vi.fn(impl));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('analyzeRepository', () => {
  it('POSTs the url and unwraps data', async () => {
    stubFetch(async () => json({ data: { id: 'abc' } }));
    await expect(analyzeRepository('a/b')).resolves.toEqual({ id: 'abc' });

    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/analyze');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ url: 'a/b' });
  });

  it('turns server errors into ApiError with code and request id', async () => {
    stubFetch(async () =>
      json({ error: { code: 'REPO_NOT_FOUND', message: 'nope', requestId: 'r1' } }, 404),
    );
    const err = await analyzeRepository('a/b').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'REPO_NOT_FOUND', status: 404, requestId: 'r1' });
  });

  it('maps a dead server to NETWORK_ERROR', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(analyzeRepository('a/b')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('survives a non-JSON error body', async () => {
    stubFetch(async () => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(analyzeRepository('a/b')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });

  it('rethrows aborts untouched', async () => {
    stubFetch(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(analyzeRepository('a/b')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('fetchFile', () => {
  it('encodes the path in the query string and unwraps data', async () => {
    stubFetch(async () => json({ data: { path: 'src/a b.js', content: 'x' } }));
    await expect(fetchFile('abc123', 'src/a b.js')).resolves.toEqual({
      path: 'src/a b.js',
      content: 'x',
    });
    expect(fetch.mock.calls[0][0]).toBe('/api/repos/abc123/files?path=src%2Fa+b.js');
  });

  it('turns an expired analysis into a typed error', async () => {
    stubFetch(async () =>
      json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: 'expired', requestId: 'r' } }, 404),
    );
    await expect(fetchFile('abc123', 'a.js')).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
      status: 404,
    });
  });
});

describe('searchRepo', () => {
  it('sends the query and returns just the results array', async () => {
    stubFetch(async () => json({ data: { query: 'rou', results: [{ name: 'route.js' }] } }));
    await expect(searchRepo('abc123', 'rou')).resolves.toEqual([{ name: 'route.js' }]);
    expect(fetch.mock.calls[0][0]).toBe('/api/repos/abc123/search?q=rou&limit=20');
  });

  it('passes the abort signal through', async () => {
    stubFetch(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(searchRepo('abc123', 'x')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('fetchHealth', () => {
  it('GETs the health route and unwraps data', async () => {
    stubFetch(async () => json({ data: { basis: 'churn', hotspots: [] } }));
    await expect(fetchHealth('abc123')).resolves.toEqual({ basis: 'churn', hotspots: [] });
    expect(fetch.mock.calls[0][0]).toBe('/api/repos/abc123/health');
  });
});
