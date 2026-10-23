import { buildDependencyGraph } from '../models/dependencyGraph.js';
import { grammarFor } from './parser/treeSitterParser.js';
import { ImportResolver } from './resolver/importResolver.js';
import { loadPathAliases } from './resolver/tsconfigPaths.js';

const ANALYZED_LANGUAGES = new Set(['js', 'ts']);
const YIELD_EVERY = 100;

const tick = () => new Promise((resolve) => setImmediate(resolve));

// Phase 2 stages: parse each source file -> resolve its imports -> build the graph.
export class SourceAnalysisService {
  constructor({ importExtractor, logger }) {
    this.extractor = importExtractor;
    this.logger = logger;
  }

  async analyze(files) {
    const started = performance.now();

    const sources = files.filter((f) => ANALYZED_LANGUAGES.has(f.language));
    const resolver = new ImportResolver({
      filePaths: new Set(files.map((f) => f.path)),
      aliases: loadPathAliases(new Map(files.map((f) => [f.path, f.content]))),
    });

    const importsByFile = new Map();
    let parseErrors = 0;

    for (const [index, file] of sources.entries()) {
      try {
        const { imports, hadErrors } = this.extractor.extract(file.content, grammarFor(file.path));
        if (hadErrors) parseErrors += 1; // tree-sitter still returns a usable partial tree
        importsByFile.set(
          file.path,
          imports.map((imp) => ({
            ...imp,
            resolution:
              imp.specifier === null
                ? { kind: 'unresolved', reason: 'dynamic' }
                : resolver.resolve(file.path, imp.specifier),
          })),
        );
      } catch (err) {
        // One broken file must never fail the whole repository.
        parseErrors += 1;
        this.logger.warn({ path: file.path, err: err.message }, 'could not parse file');
      }
      // Let other requests (health checks, cache hits) run during a long parse loop.
      if ((index + 1) % YIELD_EVERY === 0) await tick();
    }

    const parseMs = Math.round(performance.now() - started);
    return buildDependencyGraph({ sources, importsByFile, parseMs, parseErrors });
  }
}
