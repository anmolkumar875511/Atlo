import { countLines } from './dependencyGraph.js';

function describeImport(imp) {
  const { resolution } = imp;
  const base = {
    kind: imp.kind,
    line: imp.line,
    specifier: imp.specifier,
    status: resolution.kind,
  };
  if (resolution.kind === 'internal') return { ...base, target: resolution.target };
  if (resolution.kind === 'external') return { ...base, package: resolution.name };
  return { ...base, reason: resolution.reason };
}

// Everything the code panel shows about one file. Returns null if the file is not in the snapshot.
export function buildFileDetails(snapshot, path) {
  const content = snapshot.contents.get(path);
  if (content === undefined) return null;

  const file = snapshot.files.get(path);
  const analysis = snapshot.analyses.get(path);

  return {
    path,
    name: file.name,
    language: file.language,
    size: file.size,
    lines: countLines(content),
    content,
    // Only JavaScript and TypeScript files are analyzed; README, JSON etc. are viewable only.
    metrics: analysis
      ? {
          tokens: analysis.tokens,
          complexity: analysis.complexity,
          functionCount: analysis.functions.length,
          maxFunctionComplexity: analysis.functions.reduce((m, f) => Math.max(m, f.complexity), 0),
        }
      : null,
    functions: analysis?.functions ?? [],
    classes: analysis?.classes ?? [],
    imports: analysis ? analysis.imports.map(describeImport) : [],
    importedBy: snapshot.importedBy.get(path) ?? [],
  };
}
