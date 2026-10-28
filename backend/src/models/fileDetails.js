import { countLines } from './dependencyGraph.js';

const MAX_CALL_LINKS = 10;

// Outgoing and incoming calls for one function, shortened for the panel.
function describeFunction(fn, path, snapshot) {
    const calls = [];
    const seen = new Set();
    for (const link of snapshot.callLinks.get(path) ?? []) {
        if (link.caller !== fn.name) continue;
        const key = `${link.file}\0${link.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        calls.push({ name: link.name, file: link.file, line: link.defLine });
        if (calls.length >= MAX_CALL_LINKS) break;
    }
    const calledBy = (snapshot.calledBy.get(`${path}\0${fn.name}`) ?? [])
        .filter((c) => !(c.file === path && c.caller === fn.name))
        .slice(0, MAX_CALL_LINKS);
    return { ...fn, calls, calledBy };
}

function describeImport(imp) {
    const { resolution } = imp;
    const base = {
        kind: imp.kind,
        line: imp.line,
        specifier: imp.specifier,
        status: resolution.kind,
        ...(imp.names?.length ? { names: imp.names } : {}),
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
        // Only JavaScript, TypeScript and Python files are analyzed; README, JSON etc. are viewable only.
        metrics: analysis
            ? {
                  tokens: analysis.tokens,
                  complexity: analysis.complexity,
                  functionCount: analysis.functions.length,
                  maxFunctionComplexity: analysis.functions.reduce(
                      (m, f) => Math.max(m, f.complexity),
                      0
                  ),
                  commentLines: analysis.commentLines,
              }
            : null,
        functions: (analysis?.functions ?? []).map((fn) => describeFunction(fn, path, snapshot)),
        classes: analysis?.classes ?? [],
        imports: analysis ? analysis.imports.map(describeImport) : [],
        importedBy: snapshot.importedBy.get(path) ?? [],
        blastRadius: snapshot.graph.nodes.find((n) => n.id === path)?.blastRadius ?? null,
    };
}
