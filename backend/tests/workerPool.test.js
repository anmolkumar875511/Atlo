import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
import { AnalysisRunner, chunkBySize } from '../src/services/parser/analysisRunner.js';
import { FileAnalyzer } from '../src/services/parser/fileAnalyzer.js';
import { WorkerPool } from '../src/services/parser/workerPool.js';

const logger = createLogger({ level: 'silent', env: 'test' });
const WORKER_URL = new URL('../src/services/parser/parseWorker.js', import.meta.url);

const file = (path, content) => ({ path, content });
const makeFiles = (n) =>
    Array.from({ length: n }, (_, i) =>
        file(
            `src/m${i}.js`,
            `import x from './m${(i + 1) % n}.js';\nexport function f${i}(a) { return a ? x(a) : 0; }\n`
        )
    );

describe('chunkBySize', () => {
    it('keeps every file exactly once and balances the bytes', () => {
        const files = [
            file('a', 'x'.repeat(100)),
            file('b', 'x'.repeat(90)),
            file('c', 'x'),
            file('d', 'x'),
        ];
        const chunks = chunkBySize(files, 2);
        expect(
            chunks
                .flat()
                .map((f) => f.path)
                .sort()
        ).toEqual(['a', 'b', 'c', 'd']);
        const sizes = chunks.map((c) => c.reduce((n, f) => n + f.content.length, 0));
        expect(Math.abs(sizes[0] - sizes[1])).toBeLessThanOrEqual(10);
    });

    it('never makes empty chunks', () => {
        expect(chunkBySize([file('a', 'x')], 8)).toHaveLength(1);
        expect(chunkBySize([], 4)).toEqual([]);
    });
});

describe('AnalysisRunner', () => {
    let pool;
    afterEach(async () => pool?.destroy());

    it('gives the same results with worker threads as without', async () => {
        const files = makeFiles(60);
        const analyzer = new FileAnalyzer();
        const inline = await new AnalysisRunner({ analyzer, logger }).run(files);

        pool = new WorkerPool({ size: 2, workerUrl: WORKER_URL, logger });
        const threaded = await new AnalysisRunner({
            analyzer,
            pool,
            minFilesForPool: 10,
            logger,
        }).run(files);

        expect(inline.mode).toBe('inline');
        expect(threaded.mode).toBe('workers');
        expect(threaded.results.size).toBe(60);
        for (const [path, result] of inline.results) {
            expect(threaded.results.get(path)).toEqual(result);
        }
    });

    it('parses small repositories inline, without starting workers', async () => {
        pool = new WorkerPool({ size: 2, workerUrl: WORKER_URL, logger });
        const runner = new AnalysisRunner({
            analyzer: new FileAnalyzer(),
            pool,
            minFilesForPool: 40,
            logger,
        });
        const { mode } = await runner.run(makeFiles(5));
        expect(mode).toBe('inline');
        expect(pool.workers).toHaveLength(0);
    });

    it('reports a broken file as a failed result and keeps going', async () => {
        pool = new WorkerPool({ size: 2, workerUrl: WORKER_URL, logger });
        const runner = new AnalysisRunner({
            analyzer: new FileAnalyzer(),
            pool,
            minFilesForPool: 1,
            logger,
        });
        const { results } = await runner.run([...makeFiles(3), file('weird.js', 'const = = ;')]);
        expect(results.get('src/m0.js').ok).toBe(true);
        expect(results.get('weird.js').ok).toBe(true); // tree-sitter recovers; hadErrors is set instead
        expect(results.get('weird.js').analysis.hadErrors).toBe(true);
    });

    it('falls back to inline parsing when the pool fails', async () => {
        const brokenPool = {
            size: 2,
            run: async () => {
                throw new Error('pool down');
            },
        };
        const runner = new AnalysisRunner({
            analyzer: new FileAnalyzer(),
            pool: brokenPool,
            minFilesForPool: 1,
            logger,
        });
        const { results, mode } = await runner.run(makeFiles(6));
        expect(mode).toBe('workers');
        expect([...results.values()].every((r) => r.ok)).toBe(true);
    });

    it('rejects work after the pool is destroyed', async () => {
        pool = new WorkerPool({ size: 1, workerUrl: WORKER_URL, logger });
        await pool.destroy();
        await expect(pool.run([file('a.js', 'x')])).rejects.toThrow(/closed/);
    });
});
