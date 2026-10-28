import { describe, expect, it } from 'vitest';
import {
  buildClusterColors,
  clusterSummary,
  isIsolated,
  nodeColor,
  nodeSize,
  toElements,
} from './graph.js';

const node = (id, cluster, fanIn = 0, fanOut = 0) => ({
  id,
  name: id.split('/').pop(),
  cluster,
  fanIn,
  fanOut,
});

const graph = {
  nodes: [
    node('src/a.js', 'src', 0, 2),
    node('src/b.js', 'src', 1, 1),
    node('lib/c.js', 'lib', 2, 0),
    node('lone.js', '(root)'),
  ],
  edges: [
    { source: 'src/a.js', target: 'src/b.js', type: 'import' },
    { source: 'src/a.js', target: 'lib/c.js', type: 'import' },
    { source: 'src/b.js', target: 'lib/c.js', type: 'import' },
  ],
};

describe('buildClusterColors', () => {
  it('gives each cluster a colour and the biggest cluster the first one', () => {
    const colors = buildClusterColors(graph.nodes);
    expect(colors.size).toBe(3);
    expect(colors.get('src')).toBe('#c9a24b');
    expect(new Set(colors.values()).size).toBe(3);
  });

  it('is stable for the same input', () => {
    expect([...buildClusterColors(graph.nodes)]).toEqual([...buildClusterColors(graph.nodes)]);
  });

  it('uses a neutral colour once the palette runs out', () => {
    const many = Array.from({ length: 15 }, (_, i) => node(`d${i}/f.js`, `d${i}`));
    const colors = buildClusterColors(many);
    expect(colors.get('d9')).toBe('#8f8a7d');
  });
});

describe('clusterSummary', () => {
  it('counts files per cluster, biggest first, with colours', () => {
    const colors = buildClusterColors(graph.nodes);
    expect(clusterSummary(graph.nodes, colors)).toEqual([
      { cluster: 'src', count: 2, color: colors.get('src') },
      { cluster: '(root)', count: 1, color: colors.get('(root)') },
      { cluster: 'lib', count: 1, color: colors.get('lib') },
    ]);
  });
});

describe('nodeSize', () => {
  it('grows with fan-in but is capped', () => {
    expect(nodeSize(0)).toBe(12);
    expect(nodeSize(4)).toBe(20);
    expect(nodeSize(1_000_000)).toBe(40);
    expect(nodeSize(9)).toBeGreaterThan(nodeSize(4));
  });
});

describe('toElements', () => {
  const colors = buildClusterColors(graph.nodes);

  it('creates cytoscape nodes and edges', () => {
    const els = toElements(graph, { colors });
    expect(els.filter((e) => e.group === 'nodes')).toHaveLength(4);
    expect(els.filter((e) => e.group === 'edges')).toHaveLength(3);
    expect(els[0].data).toMatchObject({ id: 'src/a.js', label: 'a.js', cluster: 'src' });
    expect(els.at(-1).data).toEqual({
      id: 'src/b.js->lib/c.js',
      source: 'src/b.js',
      target: 'lib/c.js',
    });
  });

  it('can hide files that have no links', () => {
    const els = toElements(graph, { colors, hideIsolated: true });
    expect(els.some((e) => e.data.id === 'lone.js')).toBe(false);
    expect(els.filter((e) => e.group === 'nodes')).toHaveLength(3);
  });

  it('isIsolated', () => {
    expect(isIsolated(graph.nodes[3])).toBe(true);
    expect(isIsolated(graph.nodes[0])).toBe(false);
  });
});

describe('heat colouring and call links', () => {
  const colors = buildClusterColors(graph.nodes);

  it('colours by heat score when asked, and unscored files are healthy green', () => {
    const heat = new Map([['src/a.js', 1]]);
    expect(nodeColor(graph.nodes[0], { colors, colorMode: 'heat', heat })).toBe('#b0304a');
    expect(nodeColor(graph.nodes[1], { colors, colorMode: 'heat', heat })).toBe('#5f8a6a');
    expect(nodeColor(graph.nodes[0], { colors, colorMode: 'folder' })).toBe(colors.get('src'));
  });

  it('adds call edges as hidden-by-default class, only between visible files', () => {
    const withCalls = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, inCycle: n.id === 'src/b.js' })),
      callEdges: [
        { source: 'lone.js', target: 'src/a.js', type: 'call', count: 1, names: ['x'] },
        { source: 'src/a.js', target: 'lib/c.js', type: 'call', count: 2, names: ['y'] },
      ],
    };
    const all = toElements(withCalls, { colors });
    expect(all.filter((e) => e.classes === 'call')).toHaveLength(2);
    expect(all.find((e) => e.data.id === 'src/b.js').classes).toBe('in-cycle');

    const hidden = toElements(withCalls, { colors, hideIsolated: true });
    expect(hidden.filter((e) => e.classes === 'call').map((e) => e.data.id)).toEqual([
      'call:src/a.js->lib/c.js',
    ]);
  });
});
