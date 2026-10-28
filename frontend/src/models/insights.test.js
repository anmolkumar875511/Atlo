import { describe, expect, it } from 'vitest';
import { blastSet, describeLoop, heatMap } from './insights.js';

const edge = (source, target) => ({ source, target, type: 'import' });

describe('blastSet', () => {
  it('finds every file that depends on a file, directly or not', () => {
    const graph = { edges: [edge('a', 'b'), edge('b', 'c'), edge('x', 'c'), edge('c', 'd')] };
    expect([...blastSet(graph, 'd')].sort()).toEqual(['a', 'b', 'c', 'x']);
    expect([...blastSet(graph, 'b')]).toEqual(['a']);
    expect(blastSet(graph, 'a').size).toBe(0);
  });

  it('terminates on cycles and excludes the file itself', () => {
    const graph = { edges: [edge('a', 'b'), edge('b', 'a')] };
    expect([...blastSet(graph, 'a')]).toEqual(['b']);
  });
});

describe('describeLoop', () => {
  it('shows the chain and closes it', () => {
    expect(describeLoop({ path: ['src/a.js', 'src/b.js', 'lib/c.js'] })).toBe(
      'a.js → b.js → c.js → a.js',
    );
    expect(describeLoop({ path: ['src/a.js'] })).toBe('a.js imports itself');
  });
});

describe('heatMap', () => {
  it('maps file ids to scores and copes with no report', () => {
    expect(heatMap({ files: [{ id: 'a', godScore: 0.4 }] }).get('a')).toBe(0.4);
    expect(heatMap(null).size).toBe(0);
  });
});
