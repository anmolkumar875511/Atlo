import { describe, expect, it } from 'vitest';
import { computeBlastRadius, findCycles } from '../src/models/graphAlgorithms.js';
import { blastRadiusByBfs } from './reference/blastRadius.js';

// Property tests: random graphs, checked against slow but obviously correct oracles.
// A tiny seeded generator keeps every run reproducible.
function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function randomGraph(seed, { maxNodes = 14, density = 0.15 } = {}) {
    const r = rng(seed);
    const n = 1 + Math.floor(r() * maxNodes);
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const edges = [];
    for (let a = 0; a < n; a += 1) {
        for (let b = 0; b < n; b += 1) {
            if (r() < density) edges.push({ source: ids[a], target: ids[b] }); // self-loops included
            if (r() < density / 5) edges.push({ source: ids[a], target: ids[b] }); // duplicates
        }
    }
    edges.push({ source: ids[0], target: 'ghost' }); // edges to unknown files must be ignored
    return { ids, edges };
}

// Oracle for cycles: two files are in the same group iff each can reach the other.
function reachability(ids, edges) {
    const next = new Map(ids.map((id) => [id, []]));
    for (const e of edges)
        if (next.has(e.source) && next.has(e.target)) next.get(e.source).push(e.target);
    const reach = new Map();
    for (const id of ids) {
        const seen = new Set();
        const stack = [...next.get(id)];
        while (stack.length) {
            const v = stack.pop();
            if (seen.has(v)) continue;
            seen.add(v);
            stack.push(...next.get(v));
        }
        reach.set(id, seen);
    }
    return reach;
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('blast radius: bitset version equals the BFS oracle', () => {
    it.each([[0.05], [0.15], [0.4]])('on 300 random graphs, density %s', (density) => {
        for (const seed of SEEDS) {
            const { ids, edges } = randomGraph(seed, { density });
            const fast = computeBlastRadius(ids, edges);
            const slow = blastRadiusByBfs(ids, edges);
            expect([...fast].sort(), `seed ${seed}`).toEqual([...slow].sort());
        }
    });

    it('is correct across a 32-file bitset word boundary', () => {
        const names = Array.from({ length: 70 }, (_, i) => `w${i}`);
        const chain = names.slice(1).map((name, i) => ({ source: names[i], target: name }));
        const fast = computeBlastRadius(names, chain);
        expect(fast.get('w69')).toBe(69);
        expect(fast.get('w0')).toBe(0);
        expect([...fast]).toEqual([...blastRadiusByBfs(names, chain)]);
    });
});

describe('findCycles: Tarjan equals mutual reachability', () => {
    it('groups exactly the files that can reach each other, on 300 random graphs', () => {
        for (const seed of SEEDS) {
            const { ids, edges } = randomGraph(seed, { density: 0.12 });
            const reach = reachability(ids, edges);
            const cycles = findCycles(ids, edges);

            const expectedGroups = new Set();
            for (const a of ids) {
                const group = ids.filter(
                    (b) => a === b || (reach.get(a).has(b) && reach.get(b).has(a))
                );
                const inCycle = group.length > 1 || reach.get(a).has(a);
                if (inCycle) expectedGroups.add(group.sort().join('|'));
            }
            expect(new Set(cycles.map((c) => c.files.join('|'))), `seed ${seed}`).toEqual(
                expectedGroups
            );

            for (const cycle of cycles) {
                // Every file appears in exactly one cycle, and the loop is a real chain of edges.
                const pairs = new Set(edges.map((e) => `${e.source}>${e.target}`));
                const loop = cycle.path;
                loop.forEach((file, i) => {
                    expect(
                        pairs.has(`${file}>${loop[(i + 1) % loop.length]}`),
                        `seed ${seed}`
                    ).toBe(true);
                });
            }
            const all = cycles.flatMap((c) => c.files);
            expect(new Set(all).size).toBe(all.length);
        }
    });
});

describe('scale (guards against an accidental O(V^2) slowdown)', () => {
    const dag = (n, perNode) => {
        const r = rng(42);
        const ids = Array.from({ length: n }, (_, i) => `d${i}`);
        const edges = [];
        for (let i = 1; i < n; i += 1) {
            for (let k = 0; k < perNode; k += 1) {
                edges.push({ source: ids[i], target: ids[Math.floor(r() * i)] }); // only points "down": no cycles
            }
        }
        return { ids, edges };
    };

    it('blast radius on a 20,000-file DAG (the largest bitsets) finishes in a couple of seconds', () => {
        const { ids, edges } = dag(20_000, 6);
        const started = performance.now();
        const radius = computeBlastRadius(ids, edges);
        const ms = performance.now() - started;
        expect(radius.get('d0')).toBeGreaterThan(10_000);
        expect(radius.get('d19999')).toBe(0);
        expect(ms).toBeLessThan(4000);
    });

    it('blast radius and Tarjan on a 20,000-file graph with one giant cycle group', () => {
        const r = rng(9);
        const ids = Array.from({ length: 20_000 }, (_, i) => `g${i}`);
        const edges = ids.flatMap((id) =>
            Array.from({ length: 6 }, () => ({
                source: id,
                target: ids[Math.floor(r() * ids.length)],
            }))
        );
        const started = performance.now();
        const cycles = findCycles(ids, edges);
        const radius = computeBlastRadius(ids, edges);
        expect(performance.now() - started).toBeLessThan(3000);
        expect(cycles[0].size).toBeGreaterThan(19_000);
        // Files inside the group depend on each other; files outside may feed into it as well.
        expect(radius.get('g0')).toBeGreaterThanOrEqual(cycles[0].size - 1);
    });
});
