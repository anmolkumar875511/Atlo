import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { LruCache } from '../src/lib/lruCache.js';
import { createLogger } from '../src/lib/logger.js';
import { AnalysisRunner } from '../src/services/parser/analysisRunner.js';
import { FileAnalyzer } from '../src/services/parser/fileAnalyzer.js';
import { buildTestApp, makeZip } from './helpers.js';

const logger = createLogger({ level: 'silent', env: 'test' });
const file = (path, content) => ({ path, content });
const newCache = () => new LruCache({ maxEntries: 100, ttlMs: 60_000 });

function runnerWith(cache) {
    const analyzer = new FileAnalyzer();
    const spy = vi.spyOn(analyzer, 'safeAnalyze');
    return { runner: new AnalysisRunner({ analyzer, cache, logger }), spy };
}

describe('AnalysisRunner content cache', () => {
    const files = [
        file('a.js', "import b from './b';\nexport const a = () => b();\n"),
        file('b.js', 'export default function b() { return 1; }\n'),
    ];

    it('parses each file once and serves repeats from the cache', async () => {
        const { runner, spy } = runnerWith(newCache());
        const first = await runner.run(files);
        expect(first).toMatchObject({ mode: 'inline', cacheHits: 0 });
        expect(spy).toHaveBeenCalledTimes(2);

        const second = await runner.run(files);
        expect(second).toMatchObject({ mode: 'cache', cacheHits: 2 });
        expect(spy).toHaveBeenCalledTimes(2); // nothing parsed again
        expect(second.results.get('a.js').analysis).toEqual(first.results.get('a.js').analysis);
    });

    it('re-parses only the file whose text changed', async () => {
        const { runner, spy } = runnerWith(newCache());
        await runner.run(files);
        spy.mockClear();

        const edited = [files[0], file('b.js', 'export default function b() { return 2; }\n')];
        const result = await runner.run(edited);
        expect(result.cacheHits).toBe(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].path).toBe('b.js');
    });

    it('shares results between identical files at different paths', async () => {
        const { runner, spy } = runnerWith(newCache());
        await runner.run([file('x/util.js', 'export const u = () => 1;\n')]);
        spy.mockClear();
        const result = await runner.run([file('y/copy.js', 'export const u = () => 1;\n')]);
        expect(result.cacheHits).toBe(1);
        expect(spy).not.toHaveBeenCalled();
    });

    it('keeps the same text apart for different languages', async () => {
        const { runner } = runnerWith(newCache());
        await runner.run([file('a.js', 'x = 1\n')]);
        const result = await runner.run([file('a.py', 'x = 1\n')]);
        expect(result.cacheHits).toBe(0);
    });

    it('does not cache failures', async () => {
        const analyzer = new FileAnalyzer();
        vi.spyOn(analyzer, 'analyze').mockImplementation(() => {
            throw new Error('boom');
        });
        const cache = newCache();
        const runner = new AnalysisRunner({ analyzer, cache, logger });
        const result = await runner.run([file('a.js', 'x')]);
        expect(result.results.get('a.js')).toMatchObject({ ok: false, error: 'boom' });
        expect(cache.size).toBe(0);
    });

    it('works without a cache', async () => {
        const { runner } = runnerWith(null);
        expect((await runner.run(files)).cacheHits).toBe(0);
        expect((await runner.run(files)).mode).toBe('inline');
    });

    it('handles an empty file list', async () => {
        const { runner } = runnerWith(newCache());
        expect(await runner.run([])).toMatchObject({ mode: 'inline', cacheHits: 0 });
    });
});

describe('analysis cache through the API', () => {
    const FILES = {
        'src/a.js': "import { b } from './b.js';\nexport const a = b;\n",
        'src/b.js': 'export const b = 1;\n',
    };

    it('reports cache hits when a repository is analyzed again after its snapshot expired', async () => {
        let files = FILES;
        const app = buildTestApp({ download: async () => makeZip(files), snapshotTtlMs: 1 });
        const first = await request(app).post('/api/analyze').send({ url: 'demo/app' });
        expect(first.body.data.graph.stats.cacheHits).toBe(0);

        await new Promise((r) => setTimeout(r, 5)); // let the snapshot expire
        files = { ...FILES, 'src/b.js': 'export const b = 2;\n' };
        const second = await request(app).post('/api/analyze').send({ url: 'demo/app' });
        expect(second.body.data.cached).toBe(false);
        expect(second.body.data.graph.stats.cacheHits).toBe(1); // a.js unchanged, b.js re-parsed
    });
});

describe('read endpoint caching headers', () => {
    it('lets the browser reuse file and search answers', async () => {
        const app = buildTestApp();
        const { id } = (await request(app).post('/api/analyze').send({ url: 'demo/app' })).body
            .data;
        const file = await request(app).get(`/api/repos/${id}/files?path=src/index.js`);
        const search = await request(app).get(`/api/repos/${id}/search?q=add`);
        expect(file.headers['cache-control']).toBe('private, max-age=600');
        expect(search.headers['cache-control']).toBe('private, max-age=600');
    });

    it('does not cache errors', async () => {
        const res = await request(buildTestApp()).get(
            '/api/repos/0123456789abcdef/files?path=x.js'
        );
        expect(res.status).toBe(404);
        expect(res.headers['cache-control'] ?? '').not.toMatch(/max-age/);
    });
});

describe('Server-Timing', () => {
    it('reports where the time went, on a fresh analysis only', async () => {
        const app = buildTestApp();
        const first = await request(app).post('/api/analyze').send({ url: 'demo/app' });
        expect(first.headers['server-timing']).toMatch(
            /^ingest;dur=[\d.]+, extract;dur=[\d.]+, resolve;dur=[\d.]+, graph;dur=[\d.]+, algorithms;dur=[\d.]+, calls;dur=[\d.]+, onboarding;dur=[\d.]+$/
        );
        const again = await request(app).post('/api/analyze').send({ url: 'demo/app' });
        expect(again.body.data.cached).toBe(true);
        expect(again.headers['server-timing']).toBeUndefined();
    });
});

describe('stored repeat response', () => {
    const analyze = (app, headers = {}) =>
        request(app).post('/api/analyze').set(headers).send({ url: 'demo/app' });

    it('gives the same data as a fresh answer, apart from the cached flag', async () => {
        const app = buildTestApp();
        const fresh = (await analyze(app)).body;
        const repeat = (await analyze(app)).body;
        expect(fresh.data.cached).toBe(false);
        expect(repeat.data.cached).toBe(true);
        expect({ ...repeat.data, cached: false }).toEqual(fresh.data);
    });

    it('is sent gzip-compressed to browsers, and decodes to the same JSON', async () => {
        const app = buildTestApp();
        await analyze(app);
        const res = await analyze(app, { 'Accept-Encoding': 'gzip' });
        expect(res.headers['content-encoding']).toBe('gzip');
        expect(res.headers.vary).toMatch(/Accept-Encoding/i);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.data.cached).toBe(true); // supertest decompresses for us
    });

    it('is sent as plain JSON to clients that do not accept gzip', async () => {
        const app = buildTestApp();
        await analyze(app);
        const res = await analyze(app, { 'Accept-Encoding': 'identity' });
        expect(res.headers['content-encoding']).toBeUndefined();
        expect(res.body.data.cached).toBe(true);
    });

    it('is built once per analysis and reused', async () => {
        const app = buildTestApp();
        await analyze(app);
        const a = await analyze(app, { 'Accept-Encoding': 'gzip' });
        const b = await analyze(app, { 'Accept-Encoding': 'gzip' });
        expect(a.body).toEqual(b.body);
        expect(a.headers.etag).toBe(b.headers.etag); // identical bytes
    });
});
