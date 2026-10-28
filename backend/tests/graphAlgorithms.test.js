import { describe, expect, it } from 'vitest';
import { computeBlastRadius, findCycles } from '../src/models/graphAlgorithms.js';

const edges = (...pairs) => pairs.map(([source, target]) => ({ source, target, type: 'import' }));
const ids = (...names) => names;

describe('findCycles (Tarjan SCC)', () => {
  it('finds nothing in a graph without cycles', () => {
    expect(findCycles(ids('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c'], ['a', 'c']))).toEqual([]);
  });

  it('finds a two-file cycle', () => {
    const [cycle] = findCycles(ids('a', 'b', 'c'), edges(['a', 'b'], ['b', 'a'], ['b', 'c']));
    expect(cycle).toMatchObject({ id: 'cycle-1', size: 2, files: ['a', 'b'] });
    expect(cycle.path).toEqual(['a', 'b']);
  });

  it('returns one concrete loop for a longer cycle', () => {
    const [cycle] = findCycles(ids('a', 'b', 'c', 'd'), edges(['a', 'b'], ['b', 'c'], ['c', 'a']));
    expect(cycle.files).toEqual(['a', 'b', 'c']);
    expect(cycle.path).toEqual(['a', 'b', 'c']); // a -> b -> c -> (back to a)
  });

  it('treats a self-import as a cycle of one', () => {
    const [cycle] = findCycles(ids('a', 'b'), edges(['a', 'a'], ['a', 'b']));
    expect(cycle).toMatchObject({ size: 1, files: ['a'], path: ['a'] });
  });

  it('finds separate cycles and lists the biggest first', () => {
    const result = findCycles(
      ids('a', 'b', 'c', 'x', 'y'),
      edges(['x', 'y'], ['y', 'x'], ['a', 'b'], ['b', 'c'], ['c', 'a']),
    );
    expect(result.map((c) => c.files)).toEqual([
      ['a', 'b', 'c'],
      ['x', 'y'],
    ]);
  });

  it('keeps two cycles joined by a one-way link apart', () => {
    const result = findCycles(
      ids('a', 'b', 'c', 'd'),
      edges(['a', 'b'], ['b', 'a'], ['b', 'c'], ['c', 'd'], ['d', 'c']),
    );
    expect(result).toHaveLength(2);
  });

  it('ignores edges that point at unknown files', () => {
    expect(findCycles(ids('a'), edges(['a', 'ghost'], ['ghost', 'a']))).toEqual([]);
  });

  it('does not overflow the stack on a very long import chain', () => {
    const n = 60_000;
    const names = Array.from({ length: n }, (_, i) => `f${i}`);
    const chain = names.slice(1).map((name, i) => ({ source: names[i], target: name }));
    chain.push({ source: names[n - 1], target: names[0] }); // close the loop
    const [cycle] = findCycles(names, chain);
    expect(cycle.size).toBe(n);
  });
});

describe('computeBlastRadius (reverse BFS)', () => {
  it('counts every file that depends on a file, directly or not (chain)', () => {
    // a imports b, b imports c, c imports d  ->  changing d can break c, b and a
    const radius = computeBlastRadius(
      ids('a', 'b', 'c', 'd'),
      edges(['a', 'b'], ['b', 'c'], ['c', 'd']),
    );
    expect([...radius]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
  });

  it('counts a file once even when two paths reach it (diamond)', () => {
    // top imports left and right; both import base
    const radius = computeBlastRadius(
      ids('top', 'left', 'right', 'base'),
      edges(['top', 'left'], ['top', 'right'], ['left', 'base'], ['right', 'base']),
    );
    expect(radius.get('base')).toBe(3);
    expect(radius.get('left')).toBe(1);
    expect(radius.get('top')).toBe(0);
  });

  it('gives 0 to disconnected files', () => {
    const radius = computeBlastRadius(ids('a', 'b', 'c'), edges(['a', 'b']));
    expect(radius.get('c')).toBe(0);
    expect(radius.get('b')).toBe(1);
  });

  it('terminates on cycles and does not count the file itself', () => {
    const radius = computeBlastRadius(
      ids('a', 'b', 'c'),
      edges(['a', 'b'], ['b', 'a'], ['c', 'a']),
    );
    expect(radius.get('a')).toBe(2); // b and c
    expect(radius.get('b')).toBe(2); // a and c (through a)
  });

  it('handles an empty graph', () => {
    expect(computeBlastRadius([], []).size).toBe(0);
  });
});
