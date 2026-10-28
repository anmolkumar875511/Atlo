import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, makeZip } from './helpers.js';

// A small repo with a circular import (a <-> b), a hub, a test, and a Python package.
const FILES = {
  'src/a.js': "import { b } from './b.js';\nexport function a() { return b(); }\n",
  'src/b.js':
    "import { a } from './a.js';\nimport { util } from './util.js';\nexport function b() { return util() && a(); }\n",
  'src/util.js':
    '// Shared helper.\nexport function util() {\n  return 1;\n}\nexport const other = () => util();\n',
  'src/util.test.js': "import { util } from './util.js';\nutil();\n",
  'app/__init__.py': '',
  'app/main.py':
    'from .helpers import shout\n\ndef run(x):\n    """Runs."""\n    return shout(x)\n',
  'app/helpers.py': 'def shout(s):\n    if s:\n        return s.upper()\n    return s\n',
};

const analyze = (app) => request(app).post('/api/analyze').send({ url: 'demo/app' });
const withZip = (churnClient) =>
  buildTestApp({ download: async () => makeZip(FILES), churnClient });

describe('POST /api/analyze: algorithms', () => {
  it('reports circular imports with a concrete loop', async () => {
    const { graph } = (await analyze(withZip())).body.data;
    expect(graph.cycles).toHaveLength(1);
    expect(graph.cycles[0]).toMatchObject({
      id: 'cycle-1',
      size: 2,
      files: ['src/a.js', 'src/b.js'],
      path: ['src/a.js', 'src/b.js'],
    });
    expect(graph.stats.cycles).toBe(1);
    const flags = Object.fromEntries(graph.nodes.map((n) => [n.id, n.inCycle]));
    expect(flags).toMatchObject({ 'src/a.js': true, 'src/b.js': true, 'src/util.js': false });
  });

  it('computes blast radius and marks test files', async () => {
    const { graph } = (await analyze(withZip())).body.data;
    const node = (id) => graph.nodes.find((n) => n.id === id);
    // util is imported by b and the test; b is imported by a; a by b (cycle) -> a, b, test
    expect(node('src/util.js').blastRadius).toBe(3);
    expect(node('src/util.test.js')).toMatchObject({ isTest: true, blastRadius: 0 });
    expect(node('app/helpers.py').blastRadius).toBe(1);
  });

  it('graphs Python imports and links calls across files', async () => {
    const { graph } = (await analyze(withZip())).body.data;
    expect(graph.edges).toContainEqual({
      source: 'app/main.py',
      target: 'app/helpers.py',
      type: 'import',
    });
    expect(graph.callEdges).toContainEqual({
      source: 'app/main.py',
      target: 'app/helpers.py',
      type: 'call',
      count: 1,
      names: ['shout'],
    });
    expect(graph.nodes.find((n) => n.id === 'app/helpers.py')).toMatchObject({ language: 'py' });
  });

  it('suggests where to start, with reasons and a learning path', async () => {
    const { onboarding } = (await analyze(withZip())).body.data;
    expect(onboarding.starters.length).toBeGreaterThan(0);
    expect(onboarding.starters.some((s) => s.id.endsWith('.test.js'))).toBe(false);
    expect(onboarding.starters[0].reasons.length).toBeGreaterThan(0);
    expect(onboarding.path[0].stage).toBe('warm-up');
  });
});

describe('GET /api/repos/:id/files: call links', () => {
  it('shows what a function calls and who calls it', async () => {
    const app = withZip();
    const { id } = (await analyze(app)).body.data;

    const main = (await request(app).get(`/api/repos/${id}/files?path=app/main.py`)).body.data;
    const run = main.functions.find((f) => f.name === 'run');
    expect(run.calls).toEqual([{ name: 'shout', file: 'app/helpers.py', line: 1 }]);
    expect(main.metrics.commentLines).toBeGreaterThan(0); // the docstring

    const helpers = (await request(app).get(`/api/repos/${id}/files?path=app/helpers.py`)).body
      .data;
    const shout = helpers.functions.find((f) => f.name === 'shout');
    expect(shout.calledBy).toEqual([{ file: 'app/main.py', caller: 'run', line: 5 }]);
    expect(helpers.blastRadius).toBe(1);
  });
});

describe('GET /api/repos/:id/health', () => {
  const churnClient = (overrides = {}) => ({
    fetch: vi.fn(async () => ({
      available: true,
      counts: new Map([
        ['src/b.js', 20],
        ['src/util.js', 5],
        ['app/helpers.py', 1],
      ]),
      commits: 26,
      windowDays: 365,
      ms: 12,
      ...overrides,
    })),
  });

  it('returns god scores and hotspots from git churn', async () => {
    const churn = churnClient();
    const app = withZip(churn);
    const { id } = (await analyze(app)).body.data;
    const res = await request(app).get(`/api/repos/${id}/health`);

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.basis).toBe('churn');
    expect(data.churn).toMatchObject({ available: true, commits: 26, windowDays: 365 });
    expect(data.hotspots[0].id).toBe('src/b.js');
    expect(data.files.find((f) => f.id === 'src/b.js')).toMatchObject({ churn: 20, godScore: 1 });
    expect(data.files.every((f) => f.godScore >= 0 && f.godScore <= 1)).toBe(true);
  });

  it('reads git history once and caches the report', async () => {
    const churn = churnClient();
    const app = withZip(churn);
    const { id } = (await analyze(app)).body.data;
    await Promise.all([
      request(app).get(`/api/repos/${id}/health`),
      request(app).get(`/api/repos/${id}/health`),
    ]);
    await request(app).get(`/api/repos/${id}/health`);
    expect(churn.fetch).toHaveBeenCalledTimes(1);
  });

  it('still answers, with a structural score, when git is unavailable', async () => {
    const app = withZip(
      churnClient({ available: false, reason: 'git-missing', counts: new Map() }),
    );
    const { id } = (await analyze(app)).body.data;
    const { data } = (await request(app).get(`/api/repos/${id}/health`)).body;
    expect(data.basis).toBe('structural');
    expect(data.churn).toMatchObject({ available: false, reason: 'git-missing' });
    expect(data.hotspots.length).toBeGreaterThan(0);
  });

  it('retries after a failed git run instead of caching the failure', async () => {
    const churn = churnClient({ available: false, reason: 'timeout', counts: new Map() });
    const app = withZip(churn);
    const { id } = (await analyze(app)).body.data;
    await request(app).get(`/api/repos/${id}/health`);
    await request(app).get(`/api/repos/${id}/health`);
    expect(churn.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns SNAPSHOT_NOT_FOUND for an unknown analysis and rejects a bad id', async () => {
    const app = withZip(churnClient());
    const missing = await request(app).get('/api/repos/0123456789abcdef/health');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SNAPSHOT_NOT_FOUND');
    const bad = await request(app).get('/api/repos/nope/health');
    expect(bad.status).toBe(400);
  });
});
