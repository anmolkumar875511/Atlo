import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

let app;
let id;

beforeAll(async () => {
  app = buildTestApp();
  const res = await request(app).post('/api/analyze').send({ url: 'demo/app' });
  id = res.body.data.id;
});

const getFile = (path, appUnderTest = app, snapshotId = id) =>
  request(appUnderTest).get(`/api/repos/${snapshotId}/files`).query({ path });
const search = (q, extra = {}) =>
  request(app)
    .get(`/api/repos/${id}/search`)
    .query({ q, ...extra });

describe('GET /api/repos/:id/files', () => {
  it('returns content, metrics, functions and importers for a source file', async () => {
    const res = await getFile('src/utils/math.js');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ path: 'src/utils/math.js', name: 'math.js', language: 'js' });
    expect(d.content).toContain('export function clamp');
    expect(d.lines).toBe(6);
    expect(d.metrics).toMatchObject({ complexity: 3, functionCount: 2, maxFunctionComplexity: 3 });
    expect(d.metrics.tokens).toBeGreaterThan(20);
    expect(d.functions.map((f) => [f.name, f.complexity])).toEqual([
      ['add', 1],
      ['clamp', 3],
    ]);
    expect(d.importedBy).toEqual(['src/index.js', 'tests/math.test.js']);
  });

  it('describes each import: internal, external or unresolved', async () => {
    const res = await getFile('src/index.js');
    expect(res.body.data.imports).toEqual([
      {
        kind: 'import',
        line: 1,
        specifier: './utils/math.js',
        status: 'internal',
        target: 'src/utils/math.js',
      },
    ]);
  });

  it('serves non-source files without metrics', async () => {
    const res = await getFile('README.md');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      content: '# demo',
      metrics: null,
      functions: [],
      imports: [],
    });
  });

  it('does not serve files that were filtered out', async () => {
    const res = await getFile('node_modules/lodash/index.js');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('returns 404 for an analysis that does not exist or expired', async () => {
    const res = await getFile('README.md', app, 'abcdef0123456789');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SNAPSHOT_NOT_FOUND');
  });

  it.each([
    ['a bad id', 'not-an-id', 'README.md'],
    ['a path-traversal looking id', '..%2F..%2Fetc', 'README.md'],
  ])('rejects %s', async (_label, badId, path) => {
    const res = await getFile(path, app, badId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('requires a path', async () => {
    const res = await request(app).get(`/api/repos/${id}/files`);
    expect(res.status).toBe(400);
  });

  it('never reads outside the snapshot, even for ../ paths', async () => {
    const res = await getFile('../../etc/passwd');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/repos/:id/search', () => {
  it('finds a function and says where it is', async () => {
    const res = await search('clamp');
    expect(res.status).toBe(200);
    expect(res.body.data.results[0]).toMatchObject({
      type: 'function',
      name: 'clamp',
      file: 'src/utils/math.js',
      line: 2,
    });
  });

  it('finds files by name', async () => {
    const res = await search('index');
    expect(res.body.data.results[0]).toMatchObject({ type: 'file', file: 'src/index.js' });
  });

  it('respects the limit', async () => {
    const res = await search('s', { limit: 2 });
    expect(res.body.data.results.length).toBeLessThanOrEqual(2);
  });

  it.each([[{ q: '' }], [{}], [{ q: 'x', limit: 0 }], [{ q: 'x', limit: 500 }]])(
    'rejects invalid query %j',
    async (params) => {
      const res = await request(app).get(`/api/repos/${id}/search`).query(params);
      expect(res.status).toBe(400);
    },
  );

  it('rate limits reads separately from analyze', async () => {
    const limited = buildTestApp({ readRateLimitPerMinute: 2 });
    const analyzed = await request(limited).post('/api/analyze').send({ url: 'demo/app' });
    const limitedId = analyzed.body.data.id;
    const call = () => request(limited).get(`/api/repos/${limitedId}/search`).query({ q: 'add' });
    await call();
    await call();
    const res = await call();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
