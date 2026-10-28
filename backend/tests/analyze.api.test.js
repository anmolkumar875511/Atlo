import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { RepoNotFoundError } from '../src/lib/errors.js';
import { SAMPLE_FILES, buildTestApp, makeZip } from './helpers.js';

const post = (app, body) => request(app).post('/api/analyze').send(body);

describe('POST /api/analyze', () => {
  it('returns the file tree and stats for a repo URL', async () => {
    const res = await post(buildTestApp(), { url: 'https://github.com/demo/app' });

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.repo).toMatchObject({ owner: 'demo', name: 'app' });
    expect(data.cached).toBe(false);
    expect(data.stats).toMatchObject({ files: 6, dirs: 4, skipped: { ignored: 2, binary: 1 } });
    expect(data.tree.name).toBe('app');
    expect(data.tree.children.map((c) => c.name)).toEqual([
      'scripts',
      'src',
      'tests',
      'package.json',
      'README.md',
    ]);
    expect(JSON.stringify(data)).not.toContain('export const add'); // no file contents leak
  });

  it('returns the dependency graph built from real imports', async () => {
    const res = await post(buildTestApp(), { url: 'https://github.com/demo/app' });
    const { graph } = res.body.data;

    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      'scripts/tool.py',
      'src/index.js',
      'src/utils/math.js',
      'tests/math.test.js',
    ]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { source: 'src/index.js', target: 'src/utils/math.js', type: 'import' },
        { source: 'tests/math.test.js', target: 'src/utils/math.js', type: 'import' },
      ]),
    );
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.find((n) => n.id === 'src/utils/math.js')).toMatchObject({
      fanIn: 2,
      fanOut: 0,
      cluster: 'src/utils',
      language: 'js',
    });
    expect(graph.stats).toMatchObject({ nodes: 4, edges: 2, parseErrors: 0, unresolved: 0 });
  });

  it('serves the second request from cache without downloading again', async () => {
    const download = vi.fn(async () => makeZip(SAMPLE_FILES));
    const app = buildTestApp({ download });
    const first = await post(app, { url: 'demo/app' });
    const second = await post(app, { url: 'https://github.com/Demo/App' }); // same repo, other casing
    expect(first.body.data.cached).toBe(false);
    expect(second.body.data.cached).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('shares one download between concurrent requests', async () => {
    const download = vi.fn(async () => makeZip(SAMPLE_FILES));
    const app = buildTestApp({ download });
    await Promise.all([post(app, { url: 'demo/app' }), post(app, { url: 'demo/app' })]);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{}, 'INVALID_INPUT'],
    [{ url: 123 }, 'INVALID_INPUT'],
    [{ url: '   ' }, 'INVALID_INPUT'],
    [{ url: 'https://gitlab.com/a/b' }, 'INVALID_REPO_URL'],
  ])('rejects bad input %j with %s', async (body, code) => {
    const res = await post(buildTestApp(), body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects malformed JSON', async () => {
    const res = await request(buildTestApp())
      .post('/api/analyze')
      .set('Content-Type', 'application/json')
      .send('{"url": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('passes upstream errors through with a stable shape', async () => {
    const app = buildTestApp({
      download: async () => {
        throw new RepoNotFoundError();
      },
    });
    const res = await post(app, { url: 'demo/missing' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REPO_NOT_FOUND');
  });

  it('hides internals on unexpected failures', async () => {
    const app = buildTestApp({
      download: async () => {
        throw new Error('secret stack detail');
      },
    });
    const res = await post(app, { url: 'demo/app' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('rate limits repeated calls', async () => {
    const app = buildTestApp({ rateLimitPerMinute: 2 });
    await post(app, { url: 'demo/app' });
    await post(app, { url: 'demo/app' });
    const res = await post(app, { url: 'demo/app' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('platform routes', () => {
  it('GET /api/health', async () => {
    const res = await request(buildTestApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(buildTestApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sets security headers and a request id', async () => {
    const res = await request(buildTestApp()).get('/api/health');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
