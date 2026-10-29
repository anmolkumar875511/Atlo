import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchIndex } from '../src/models/searchIndex.js';

const files = [
    { path: 'src/graph/graphBuilder.js', name: 'graphBuilder.js' },
    { path: 'src/graph/index.js', name: 'index.js' },
    { path: 'README.md', name: 'README.md' },
    { path: 'lib/router/route.js', name: 'route.js' },
];
const analyses = new Map([
    [
        'src/graph/graphBuilder.js',
        {
            classes: [{ name: 'GraphBuilder', line: 3 }],
            functions: [
                { name: 'buildGraph', line: 10 },
                { name: 'GraphBuilder.addEdge', line: 20 },
            ],
        },
    ],
    ['lib/router/route.js', { classes: [], functions: [{ name: 'Route.handle', line: 5 }] }],
]);
const index = buildSearchIndex({ files, analyses });
const names = (q, limit) => searchIndex(index, q, limit).map((r) => `${r.type}:${r.name}`);

describe('buildSearchIndex', () => {
    it('indexes every file plus named functions and classes', () => {
        expect(index).toHaveLength(4 + 1 + 3);
    });
});

describe('searchIndex', () => {
    it('ranks an exact name first', () => {
        expect(names('buildgraph')[0]).toBe('function:buildGraph');
    });

    it('is case-insensitive and ignores surrounding spaces', () => {
        expect(names('  README.MD  ')[0]).toBe('file:README.md');
    });

    it('prefers prefix matches over substring matches', () => {
        const result = names('graph');
        expect(result.indexOf('class:GraphBuilder')).toBeLessThan(
            result.indexOf('function:buildGraph')
        );
    });

    it('matches a method by the part after the dot', () => {
        expect(names('handle')[0]).toBe('function:Route.handle');
        expect(names('addedge')[0]).toBe('function:GraphBuilder.addEdge');
    });

    it('finds files by folder name', () => {
        expect(names('router')).toContain('file:route.js');
    });

    it('supports fuzzy letter-order matches', () => {
        expect(names('gbld')).toContain('class:GraphBuilder');
    });

    it('puts files before classes before functions on equal scores', () => {
        const results = searchIndex(index, 'index', 5);
        expect(results[0]).toMatchObject({ type: 'file', name: 'index.js' });
    });

    it('returns file path and line for navigation', () => {
        expect(searchIndex(index, 'buildGraph', 1)[0]).toMatchObject({
            file: 'src/graph/graphBuilder.js',
            line: 10,
        });
    });

    it('respects the limit and returns nothing for empty or unmatched queries', () => {
        expect(searchIndex(index, 'a', 2)).toHaveLength(2);
        expect(searchIndex(index, '   ')).toEqual([]);
        expect(searchIndex(index, 'zzzzqqq')).toEqual([]);
    });
});
