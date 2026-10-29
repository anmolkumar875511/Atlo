// Graph algorithms on the file graph. Pure functions over ids and edges, so each one is tested
// on tiny hand-made graphs. Both use flat typed arrays (CSR layout) instead of objects: a
// 5,000-file repository stays fast and uses little memory.

// Compressed adjacency: the neighbours of node v are targets[start[v] .. start[v + 1]).
function buildAdjacency(count, fromIdx, toIdx) {
    const start = new Int32Array(count + 1);
    for (let i = 0; i < fromIdx.length; i += 1) start[fromIdx[i] + 1] += 1;
    for (let v = 0; v < count; v += 1) start[v + 1] += start[v];
    const fill = start.slice(0, count);
    const targets = new Int32Array(fromIdx.length);
    for (let i = 0; i < fromIdx.length; i += 1) targets[fill[fromIdx[i]]++] = toIdx[i];
    return { start, targets };
}

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
    return { index, from: Int32Array.from(from), to: Int32Array.from(to) };
}

// Tarjan's strongly connected components. A strongly connected component is a set of files that
// can all reach each other by following imports, which is exactly a circular import.
// One depth-first search visits every node and edge once: O(V + E). The recursion is replaced by
// an explicit stack so a long import chain cannot overflow the call stack.
export function stronglyConnectedComponents(count, start, targets) {
    const order = new Int32Array(count).fill(-1); // discovery order
    const low = new Int32Array(count); // lowest discovery order reachable from the subtree
    const onStack = new Uint8Array(count);
    const next = new Int32Array(count); // next neighbour to look at, per node
    const stack = [];
    const components = [];
    let counter = 0;

    for (let root = 0; root < count; root += 1) {
        if (order[root] !== -1) continue;
        const work = [root];
        order[root] = low[root] = counter++;
        next[root] = start[root];
        stack.push(root);
        onStack[root] = 1;

        while (work.length > 0) {
            const v = work[work.length - 1];
            if (next[v] < start[v + 1]) {
                const w = targets[next[v]++];
                if (order[w] === -1) {
                    order[w] = low[w] = counter++;
                    next[w] = start[w];
                    stack.push(w);
                    onStack[w] = 1;
                    work.push(w);
                } else if (onStack[w]) {
                    low[v] = Math.min(low[v], order[w]);
                }
                continue;
            }

            work.pop();
            if (work.length > 0) {
                const parent = work[work.length - 1];
                low[parent] = Math.min(low[parent], low[v]);
            }
            if (low[v] === order[v]) {
                const component = [];
                let w;
                do {
                    w = stack.pop();
                    onStack[w] = 0;
                    component.push(w);
                } while (w !== v);
                components.push(component);
            }
        }
    }
    return components;
}

// The shortest loop that passes through `startNode`, found by breadth-first search inside the
// component. Gives the UI one concrete chain to show: a -> b -> c -> (back to a).
function shortestLoop(startNode, members, start, targets) {
    const parent = new Map([[startNode, -1]]);
    const queue = [startNode];
    for (let head = 0; head < queue.length; head += 1) {
        const v = queue[head];
        for (let i = start[v]; i < start[v + 1]; i += 1) {
            const w = targets[i];
            if (!members.has(w)) continue;
            if (w === startNode) {
                const loop = [];
                for (let cur = v; cur !== -1; cur = parent.get(cur)) loop.push(cur);
                return loop.reverse();
            }
            if (!parent.has(w)) {
                parent.set(w, v);
                queue.push(w);
            }
        }
    }
    return [startNode];
}

// Circular imports: components with more than one file, or one file that imports itself.
// Each cycle lists its files (sorted) and one concrete loop `path`, largest cycles first.
export function findCycles(nodeIds, edges) {
    const { from, to } = indexEdges(nodeIds, edges);
    const { start, targets } = buildAdjacency(nodeIds.length, from, to);
    const selfLoop = new Uint8Array(nodeIds.length);
    for (let i = 0; i < from.length; i += 1) if (from[i] === to[i]) selfLoop[from[i]] = 1;

    const cycles = [];
    for (const component of stronglyConnectedComponents(nodeIds.length, start, targets)) {
        if (component.length === 1 && !selfLoop[component[0]]) continue;
        const files = component.map((i) => nodeIds[i]).sort();
        const first = nodeIds.indexOf(files[0]);
        const loop = shortestLoop(first, new Set(component), start, targets);
        cycles.push({ size: files.length, files, path: loop.map((i) => nodeIds[i]) });
    }

    cycles.sort((a, b) => b.size - a.size || a.files[0].localeCompare(b.files[0]));
    return cycles.map((cycle, i) => ({ id: `cycle-${i + 1}`, ...cycle }));
}

// Blast radius: how many files could break if this file changes (everything that depends on it,
// directly or through other files; the file itself is not counted).
//
// The obvious way is one breadth-first search per file over the reversed edges: O(V * (V + E)).
// That took 15 s for 20,000 files. Two facts make it fast:
//   1. Files in the same circular-import group (strongly connected component) all have exactly
//      the same set of dependents, so the work is done once per GROUP on the condensed graph,
//      which is a DAG.
//   2. On a DAG, "everything that can reach me" is my own files plus the union of that set for each
//      group that imports me. A set of files is a bitset, and a union is one OR per 32 files.
// Groups are visited importers-first, so every set is complete before it is needed.
// Cost: O(E_groups * V / 32) time and O(groups * V / 32) words of memory (50 MB for 20,000 files).
export function computeBlastRadius(nodeIds, edges) {
    const count = nodeIds.length;
    const radius = new Map();
    if (count === 0) return radius;

    const { from, to } = indexEdges(nodeIds, edges);
    const forward = buildAdjacency(count, from, to);
    const components = stronglyConnectedComponents(count, forward.start, forward.targets);

    // Tarjan emits a group only after every group it imports, so the LAST emitted group imports
    // nothing that comes after it. Walking in reverse therefore visits importers first.
    const groupOf = new Int32Array(count);
    components.forEach((members, g) => members.forEach((v) => (groupOf[v] = g)));

    const importers = components.map(() => []); // group -> groups that import it
    const lastSeen = new Int32Array(components.length).fill(-1); // dedupes (importer, group) pairs
    for (let g = 0; g < components.length; g += 1) {
        for (const v of components[g]) {
            for (let i = forward.start[v]; i < forward.start[v + 1]; i += 1) {
                const target = groupOf[forward.targets[i]];
                if (target !== g && lastSeen[target] !== g) {
                    lastSeen[target] = g;
                    importers[target].push(g);
                }
            }
        }
    }

    const words = (count + 31) >>> 5;
    const reach = new Array(components.length); // group -> bitset of files that depend on it
    for (let g = components.length - 1; g >= 0; g -= 1) {
        const bits = new Uint32Array(words);
        for (const v of components[g]) bits[v >>> 5] |= 1 << (v & 31);
        for (const p of importers[g]) {
            const other = reach[p];
            for (let w = 0; w < words; w += 1) bits[w] |= other[w];
        }
        reach[g] = bits;
        const total = popcount(bits);
        for (const v of components[g]) radius.set(nodeIds[v], total - 1);
    }
    return radius;
}

function popcount(bits) {
    let total = 0;
    for (let i = 0; i < bits.length; i += 1) {
        let x = bits[i];
        x -= (x >>> 1) & 0x55555555;
        x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
        total += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return total;
}
