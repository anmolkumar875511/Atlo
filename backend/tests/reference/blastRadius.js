// Reference implementation: one reverse breadth-first search per file, O(V * (V + E)).
// Slow on big graphs, but obviously correct, so tests compare the fast version against it.
function indexEdges(nodeIds, edges) {
    const index = new Map(nodeIds.map((id, i) => [id, i]));
    const from = [];
    const to = [];
    for (const edge of edges) {
        const a = index.get(edge.source);
        const b = index.get(edge.target);
        if (a !== undefined && b !== undefined) {
            from.push(a);
            to.push(b);
        }
    }
    return { from, to };
}

export function blastRadiusByBfs(nodeIds, edges) {
    const { from, to } = indexEdges(nodeIds, edges);
    const dependents = nodeIds.map(() => []);
    for (let i = 0; i < from.length; i += 1) dependents[to[i]].push(from[i]);
    const radius = new Map();
    nodeIds.forEach((id, source) => {
        const seen = new Set([source]);
        const queue = [source];
        for (let head = 0; head < queue.length; head += 1) {
            for (const w of dependents[queue[head]]) {
                if (!seen.has(w)) {
                    seen.add(w);
                    queue.push(w);
                }
            }
        }
        radius.set(id, seen.size - 1);
    });
    return radius;
}
