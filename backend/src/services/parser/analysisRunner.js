const CHUNKS_PER_WORKER = 3;

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
export class AnalysisRunner {
    constructor({ analyzer, pool = null, minFilesForPool = 40, logger }) {
        this.analyzer = analyzer;
        this.pool = pool;
        this.minFilesForPool = minFilesForPool;
        this.logger = logger;
    }

    // Resolves to Map(path -> { ok, analysis | error }).
    async run(files) {
        const results = new Map();
        const add = (list) => list.forEach((r) => results.set(r.path, r));

        if (!this.pool || files.length < this.minFilesForPool) {
            for (const file of files) results.set(file.path, this.analyzer.safeAnalyze(file));
            return { results, mode: 'inline' };
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
        return { results, mode: 'workers' };
    }
}
