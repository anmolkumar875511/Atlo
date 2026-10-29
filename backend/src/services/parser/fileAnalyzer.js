import { MetricsExtractor } from './metricsExtractor.js';
import { ScanExtractor } from './scanExtractor.js';
import { grammarFor, TreeSitterParser } from './treeSitterParser.js';

// Everything we learn from ONE file, from a single parse: metrics, then imports and call sites
// (one combined query). It returns plain objects only, so the result can cross a worker thread
// boundary. The main thread and every worker build their own instance (a native parser is not
// shareable).
export class FileAnalyzer {
    constructor({ parser = new TreeSitterParser() } = {}) {
        this.parser = parser;
        this.metricsExtractor = new MetricsExtractor();
        this.scanExtractor = new ScanExtractor({ parser });
    }

    analyze(file) {
        const grammar = grammarFor(file.path);
        const tree = this.parser.parse(file.content, grammar);
        const metrics = this.metricsExtractor.extract(tree, grammar);
        const { imports, calls, hadErrors } = this.scanExtractor.scan(
            tree,
            grammar,
            metrics.functions
        );
        return { ...metrics, imports, calls, hadErrors };
    }

    // Never throws: one broken file must not fail the whole repository.
    safeAnalyze(file) {
        try {
            return { path: file.path, ok: true, analysis: this.analyze(file) };
        } catch (err) {
            return { path: file.path, ok: false, error: err.message };
        }
    }
}
