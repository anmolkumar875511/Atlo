import { CallExtractor } from './callExtractor.js';
import { ImportExtractor } from './importExtractor.js';
import { MetricsExtractor } from './metricsExtractor.js';
import { grammarFor, TreeSitterParser } from './treeSitterParser.js';

// Everything we learn from ONE file, from a single parse: imports, metrics and call sites.
// It returns plain objects only, so the result can cross a worker thread boundary.
// The main thread and every worker build their own instance (a native parser is not shareable).
export class FileAnalyzer {
    constructor({ parser = new TreeSitterParser() } = {}) {
        this.parser = parser;
        this.importExtractor = new ImportExtractor({ parser });
        this.metricsExtractor = new MetricsExtractor();
        this.callExtractor = new CallExtractor({ parser });
    }

    analyze(file) {
        const grammar = grammarFor(file.path);
        const tree = this.parser.parse(file.content, grammar);
        const { imports, hadErrors } = this.importExtractor.extract(tree, grammar);
        const metrics = this.metricsExtractor.extract(tree, grammar);
        const calls = this.callExtractor.extract(tree, grammar, metrics.functions);
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
