import { addGraphInsights, buildDependencyGraph } from '../models/dependencyGraph.js';
import { buildCallGraph } from '../models/callGraph.js';
import { computeBlastRadius, findCycles } from '../models/graphAlgorithms.js';
import { buildOnboarding } from '../models/onboarding.js';
import { ImportResolver } from './resolver/importResolver.js';
import { PythonResolver } from './resolver/pythonResolver.js';
import { loadPathAliases } from './resolver/tsconfigPaths.js';

const ANALYZED_LANGUAGES = new Set(['js', 'ts', 'py']);

// Pipeline for the source files of one repository:
//   1. parse every file once (worker threads for big repos): imports, metrics, call sites
//   2. resolve import strings to real files
//   3. build the dependency graph
//   4. run the algorithms: Tarjan cycles, blast radius, call linking, onboarding path
// Each stage is a pure function or a small class, so each is tested on its own.
export class SourceAnalysisService {
  constructor({ runner, logger }) {
    this.runner = runner;
    this.logger = logger;
  }

  async analyze(files) {
    const started = performance.now();

    const sources = files.filter((f) => ANALYZED_LANGUAGES.has(f.language));
    const filePaths = new Set(files.map((f) => f.path));
    const jsResolver = new ImportResolver({
      filePaths,
      aliases: loadPathAliases(new Map(files.map((f) => [f.path, f.content]))),
    });
    const pyResolver = new PythonResolver({ filePaths });

    const { results, mode } = await this.runner.run(sources);

    const fileAnalyses = new Map();
    const importsByFile = new Map();
    let parseErrors = 0;

    for (const file of sources) {
      const result = results.get(file.path);
      if (!result?.ok) {
        // One broken file must never fail the whole repository.
        parseErrors += 1;
        this.logger.warn({ path: file.path, err: result?.error }, 'could not parse file');
        continue;
      }
      const { analysis } = result;
      if (analysis.hadErrors) parseErrors += 1; // tree-sitter still returns a usable partial tree

      const resolved =
        file.language === 'py'
          ? resolvePython(pyResolver, file.path, analysis.imports)
          : resolveScript(jsResolver, file.path, analysis.imports);
      importsByFile.set(file.path, resolved);
      fileAnalyses.set(file.path, { ...analysis, imports: resolved });
    }

    const parseMs = Math.round(performance.now() - started);
    const graph = buildDependencyGraph({
      sources,
      importsByFile,
      metricsByFile: fileAnalyses,
      parseMs,
      parseErrors,
    });
    graph.stats.parseMode = mode;

    const nodeIds = graph.nodes.map((n) => n.id);
    const cycles = findCycles(nodeIds, graph.edges);
    const blastRadius = computeBlastRadius(nodeIds, graph.edges);

    const importTargets = new Map();
    for (const edge of graph.edges) {
      if (!importTargets.has(edge.source)) importTargets.set(edge.source, []);
      importTargets.get(edge.source).push(edge.target);
    }
    const calls = buildCallGraph({ analyses: fileAnalyses, importTargets });

    addGraphInsights(graph, { cycles, blastRadius, callEdges: calls.edges });
    const onboarding = buildOnboarding({
      nodes: graph.nodes,
      edges: graph.edges,
      analyses: fileAnalyses,
    });

    return {
      graph,
      fileAnalyses,
      onboarding,
      callLinks: calls.linksByFile,
      calledBy: calls.calledBy,
    };
  }
}

function resolveScript(resolver, path, imports) {
  return imports.map((imp) => ({
    ...imp,
    resolution:
      imp.specifier === null
        ? { kind: 'unresolved', reason: 'dynamic' }
        : resolver.resolve(path, imp.specifier),
  }));
}

// A Python import can point at several files (`from pkg import a, b`), so it expands into one
// entry per target. All entries keep the same line, kind and specifier.
function resolvePython(resolver, path, imports) {
  return imports.flatMap((imp) =>
    resolver
      .resolve(path, imp)
      .filter((resolution) => !(resolution.kind === 'internal' && resolution.target === path))
      .map((resolution) => ({ ...imp, resolution })),
  );
}
