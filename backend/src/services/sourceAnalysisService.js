import { buildDependencyGraph } from '../models/dependencyGraph.js';
import { grammarFor } from './parser/treeSitterParser.js';
import { ImportResolver } from './resolver/importResolver.js';
import { loadPathAliases } from './resolver/tsconfigPaths.js';

const ANALYZED_LANGUAGES = new Set(['js', 'ts']);
const YIELD_EVERY = 100;

const tick = () => new Promise((resolve) => setImmediate(resolve));

// Stages for each source file: parse once -> imports + metrics -> resolve imports.
// Then the graph is built from all files together.
export class SourceAnalysisService {
  constructor({ parser, importExtractor, metricsExtractor, logger }) {
    this.parser = parser;
    this.importExtractor = importExtractor;
    this.metricsExtractor = metricsExtractor;
    this.logger = logger;
  }

  async analyze(files) {
    const started = performance.now();

    const sources = files.filter((f) => ANALYZED_LANGUAGES.has(f.language));
    const resolver = new ImportResolver({
      filePaths: new Set(files.map((f) => f.path)),
      aliases: loadPathAliases(new Map(files.map((f) => [f.path, f.content]))),
    });

    const fileAnalyses = new Map();
    const importsByFile = new Map();
    let parseErrors = 0;

    for (const [index, file] of sources.entries()) {
      try {
        const grammar = grammarFor(file.path);
        const tree = this.parser.parse(file.content, grammar);
        const { imports, hadErrors } = this.importExtractor.extract(tree, grammar);
        const metrics = this.metricsExtractor.extract(tree, grammar);
        if (hadErrors) parseErrors += 1; // tree-sitter still returns a usable partial tree

        const resolved = imports.map((imp) => ({
          ...imp,
          resolution:
            imp.specifier === null
              ? { kind: 'unresolved', reason: 'dynamic' }
              : resolver.resolve(file.path, imp.specifier),
        }));
        importsByFile.set(file.path, resolved);
        fileAnalyses.set(file.path, { ...metrics, imports: resolved });
      } catch (err) {
        // One broken file must never fail the whole repository.
        parseErrors += 1;
        this.logger.warn({ path: file.path, err: err.message }, 'could not parse file');
      }
      // Let other requests (health checks, cache hits) run during a long parse loop.
      if ((index + 1) % YIELD_EVERY === 0) await tick();
    }

    const parseMs = Math.round(performance.now() - started);
    const graph = buildDependencyGraph({
      sources,
      importsByFile,
      metricsByFile: fileAnalyses,
      parseMs,
      parseErrors,
    });
    return { graph, fileAnalyses };
  }
}
