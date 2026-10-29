import { renderAnalyze } from '../views/analyze.view.js';
import { repeatResponse } from '../views/encodedResponse.js';

export class AnalyzeController {
    constructor({ repoAnalysisService }) {
        this.service = repoAnalysisService;
        this.analyze = this.analyze.bind(this);
    }

    async analyze(req, res) {
        const result = await this.service.analyze(req.body.url);
        // Shows up in the browser's network panel ("Timing" tab): where the time went.
        if (!result.cached) {
            res.set('Server-Timing', serverTiming(result.snapshot));
            res.status(200).json(renderAnalyze(result));
            return;
        }

        // Repeat request: send the stored answer, already compressed if the browser accepts gzip.
        const stored = repeatResponse(result.snapshot);
        res.status(200).type('application/json').set('Vary', 'Accept-Encoding');
        if (req.acceptsEncodings('gzip')) {
            res.set('Content-Encoding', 'gzip').send(stored.gzip);
        } else {
            res.send(stored.json);
        }
    }
}

const toKebab = (key) => key.replace(/Ms$/, '');

function serverTiming(snapshot) {
    const entries = { ingest: snapshot.stats.ingestMs };
    for (const [key, ms] of Object.entries(snapshot.graph.stats.timings ?? {})) {
        entries[toKebab(key)] = ms;
    }
    return Object.entries(entries)
        .map(([name, ms]) => `${name};dur=${ms}`)
        .join(', ');
}
