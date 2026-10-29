import { createHash } from 'node:crypto';
import { grammarFor } from './treeSitterParser.js';

const CHUNKS_PER_WORKER = 3;

// Same text + same grammar always gives the same analysis, whatever the repository or the path.
const cacheKey = (file) =>
    `${grammarFor(file.path)}:${createHash('sha1').update(file.content).digest('base64')}`;

// Splits files into chunks of roughly equal byte size, biggest files first, so no worker is left
// holding one giant chunk while the others sit idle.
export function chunkBySize(files, chunkCount) {
    const count = Math.max(1, Math.min(chunkCount, files.length));
    const chunks = Array.from({ length: count }, () => ({ bytes: 0, files: [] }));
    const bySize = [...files].sort((a, b) => b.content.length - a.content.length);
    for (const file of bySize) {
        const lightest = chunks.reduce((min, c) => (c.bytes < min.bytes ? c : min));
        lightest.files.push(file);
        lightest.bytes += file.content.length;
    }
    return chunks.map((c) => c.files).filter((c) => c.length > 0);
}

// Decides where per-file analysis runs: in worker threads for big repositories, inline for small
// ones (starting workers costs more than it saves below `minFilesForPool`). If the pool fails for
// any reason the chunk is analyzed inline, so a request never fails because of the optimization.
//
// Results are also kept by file CONTENT. Analyzing the same repository again (after it expired
// from the snapshot cache, on another branch, or a fork with mostly unchanged files) only parses
// the files that actually changed. Cached analyses are shared between snapshots and must be
// treated as read-only.
export class AnalysisRunner {
    constructor({ analyzer, pool = null, minFilesForPool = 40, cache = null, logger }) {
        this.analyzer = analyzer;
        this.pool = pool;
        this.minFilesForPool = minFilesForPool;
        this.cache = cache;
        this.logger = logger;
    }

    // Resolves to { results: Map(path -> { ok, analysis | error }), mode, cacheHits }.
    async run(files) {
        const results = new Map();
        const keys = new Map();
        const misses = [];

        for (const file of files) {
            const key = this.cache ? cacheKey(file) : null;
            const hit = key ? this.cache.get(key) : undefined;
            if (hit) results.set(file.path, { path: file.path, ok: true, analysis: hit });
            else {
                misses.push(file);
                if (key) keys.set(file.path, key);
            }
        }
        const cacheHits = files.length - misses.length;

        const mode = await this.#parse(misses, results);

        if (this.cache) {
            for (const file of misses) {
                const result = results.get(file.path);
                if (result?.ok) this.cache.set(keys.get(file.path), result.analysis);
            }
        }
        return {
            results,
            mode: misses.length === 0 && files.length > 0 ? 'cache' : mode,
            cacheHits,
        };
    }

    async #parse(files, results) {
        const add = (list) => list.forEach((r) => results.set(r.path, r));

        if (!this.pool || files.length < this.minFilesForPool) {
            for (const file of files) results.set(file.path, this.analyzer.safeAnalyze(file));
            return 'inline';
        }

        const chunks = chunkBySize(files, this.pool.size * CHUNKS_PER_WORKER);
        await Promise.all(
            chunks.map(async (chunk) => {
                const payload = chunk.map(({ path, content }) => ({ path, content }));
                try {
                    add(await this.pool.run(payload));
                } catch (err) {
                    this.logger?.warn({ err: err.message }, 'worker chunk failed, parsing inline');
                    add(chunk.map((file) => this.analyzer.safeAnalyze(file)));
                }
            })
        );
        return 'workers';
    }
}
