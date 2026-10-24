const MAX_EXTERNALS = 100;
const MAX_UNRESOLVED = 200;

// Folders that only wrap the real modules, so "src/utils" is a better group than "src".
const WRAPPER_FOLDERS = new Set(['src', 'lib', 'app', 'packages']);

export function clusterOf(path) {
  const parts = path.split('/');
  if (parts.length === 1) return '(root)';
  if (WRAPPER_FOLDERS.has(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

export function countLines(content) {
  if (!content) return 0;
  let lines = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) lines += 1;
  }
  return content.endsWith('\n') ? lines - 1 : lines;
}

// Pure function: parsed + resolved imports in, graph JSON out.
// Nodes are source files. An edge means "source imports target".
export function buildDependencyGraph({
  sources,
  importsByFile,
  metricsByFile,
  parseMs,
  parseErrors,
}) {
  const nodes = sources.map((file) => ({
    id: file.path,
    name: file.name,
    language: file.language,
    lines: countLines(file.content),
    size: file.size,
    tokens: metricsByFile.get(file.path)?.tokens ?? 0,
    complexity: metricsByFile.get(file.path)?.complexity ?? 0,
    functionCount: metricsByFile.get(file.path)?.functions.length ?? 0,
    cluster: clusterOf(file.path),
    fanIn: 0,
    fanOut: 0,
    unresolved: 0,
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edges = [];
  const edgeKeys = new Set();
  const externals = new Map();
  const unresolvedList = [];
  let unresolvedTotal = 0;
  let assetImports = 0;

  for (const file of sources) {
    const from = nodeById.get(file.path);
    for (const imp of importsByFile.get(file.path) ?? []) {
      const { resolution } = imp;

      if (resolution.kind === 'internal') {
        const to = nodeById.get(resolution.target);
        if (!to) {
          assetImports += 1; // json, css, images: real files, but not part of the code graph
          continue;
        }
        const key = `${file.path}\0${to.id}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        edges.push({ source: file.path, target: to.id, type: 'import' });
        from.fanOut += 1;
        to.fanIn += 1;
      } else if (resolution.kind === 'external') {
        if (!externals.has(resolution.name)) externals.set(resolution.name, new Set());
        externals.get(resolution.name).add(file.path);
      } else {
        from.unresolved += 1;
        unresolvedTotal += 1;
        if (unresolvedList.length < MAX_UNRESOLVED) {
          unresolvedList.push({
            from: file.path,
            line: imp.line,
            specifier: imp.specifier,
            reason: resolution.reason,
          });
        }
      }
    }
  }

  const externalList = [...externals.entries()]
    .map(([name, files]) => ({ name, importedBy: files.size }))
    .sort((a, b) => b.importedBy - a.importedBy || a.name.localeCompare(b.name));

  return {
    nodes,
    edges,
    externals: externalList.slice(0, MAX_EXTERNALS),
    unresolved: unresolvedList,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      externalPackages: externalList.length,
      unresolved: unresolvedTotal,
      assetImports,
      parseErrors,
      parseMs,
    },
  };
}
