import { describe, expect, it } from 'vitest';
import { buildDependencyGraph, clusterOf, countLines } from '../src/models/dependencyGraph.js';

const file = (path, content = 'x\n') => ({
  path,
  name: path.split('/').pop(),
  size: content.length,
  language: 'js',
  content,
});
const internal = (target, line = 1) => ({
  kind: 'import',
  line,
  specifier: target,
  resolution: { kind: 'internal', target },
});
const external = (name) => ({
  kind: 'import',
  line: 1,
  specifier: name,
  resolution: { kind: 'external', name },
});
const unresolved = (reason, specifier = 'x') => ({
  kind: 'import',
  line: 4,
  specifier,
  resolution: { kind: 'unresolved', reason },
});

function build(sources, imports, metrics = {}) {
  return buildDependencyGraph({
    sources,
    importsByFile: new Map(Object.entries(imports)),
    metricsByFile: new Map(Object.entries(metrics)),
    parseMs: 5,
    parseErrors: 0,
  });
}

describe('buildDependencyGraph', () => {
  const sources = [file('src/a.js'), file('src/b.js'), file('src/c.js'), file('lone.js')];

  it('creates one node per source file and an edge per unique import', () => {
    const g = build(sources, {
      'src/a.js': [internal('src/b.js'), internal('src/b.js'), internal('src/c.js')],
      'src/b.js': [internal('src/c.js')],
    });
    expect(g.nodes.map((n) => n.id)).toEqual(['src/a.js', 'src/b.js', 'src/c.js', 'lone.js']);
    expect(g.edges).toEqual([
      { source: 'src/a.js', target: 'src/b.js', type: 'import' },
      { source: 'src/a.js', target: 'src/c.js', type: 'import' },
      { source: 'src/b.js', target: 'src/c.js', type: 'import' },
    ]);
  });

  it('computes fan-in and fan-out from unique edges', () => {
    const g = build(sources, {
      'src/a.js': [internal('src/b.js'), internal('src/c.js')],
      'src/b.js': [internal('src/c.js')],
    });
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(byId['src/a.js']).toMatchObject({ fanIn: 0, fanOut: 2 });
    expect(byId['src/c.js']).toMatchObject({ fanIn: 2, fanOut: 0 });
    expect(byId['lone.js']).toMatchObject({ fanIn: 0, fanOut: 0 });
  });

  it('keeps a self-import as a self-loop edge', () => {
    const g = build([file('a.js')], { 'a.js': [internal('a.js')] });
    expect(g.edges).toEqual([{ source: 'a.js', target: 'a.js', type: 'import' }]);
  });

  it('counts external packages by how many files import them, most used first', () => {
    const g = build(sources, {
      'src/a.js': [external('react'), external('lodash')],
      'src/b.js': [external('react')],
    });
    expect(g.externals).toEqual([
      { name: 'react', importedBy: 2 },
      { name: 'lodash', importedBy: 1 },
    ]);
    expect(g.stats.externalPackages).toBe(2);
    expect(g.edges).toEqual([]);
  });

  it('records unresolved imports without creating edges', () => {
    const g = build(sources, {
      'src/a.js': [unresolved('alias', '@/x'), unresolved('dynamic', null)],
    });
    expect(g.stats.unresolved).toBe(2);
    expect(g.nodes[0].unresolved).toBe(2);
    expect(g.unresolved[0]).toEqual({
      from: 'src/a.js',
      line: 4,
      specifier: '@/x',
      reason: 'alias',
    });
    expect(g.edges).toEqual([]);
  });

  it('ignores imports of real files that are not source code (json, css)', () => {
    const g = build(sources, { 'src/a.js': [internal('src/data.json')] });
    expect(g.edges).toEqual([]);
    expect(g.stats.assetImports).toBe(1);
  });

  it('puts tokens, complexity and function count on each node', () => {
    const g = build(
      [file('a.js'), file('b.js')],
      {},
      {
        'a.js': { tokens: 120, complexity: 7, functions: [{}, {}] },
      },
    );
    expect(g.nodes[0]).toMatchObject({ tokens: 120, complexity: 7, functionCount: 2 });
    expect(g.nodes[1]).toMatchObject({ tokens: 0, complexity: 0, functionCount: 0 });
  });

  it('copies the parse stats through', () => {
    expect(build([], {}).stats).toMatchObject({ nodes: 0, edges: 0, parseMs: 5, parseErrors: 0 });
  });
});

describe('helpers', () => {
  it('clusterOf groups by top folder, one level deeper for wrapper folders', () => {
    expect(clusterOf('index.js')).toBe('(root)');
    expect(clusterOf('lib/router/route.js')).toBe('lib/router');
    expect(clusterOf('src/index.js')).toBe('src');
    expect(clusterOf('src/utils/math.js')).toBe('src/utils');
    expect(clusterOf('test/a.js')).toBe('test');
  });

  it('countLines ignores the final newline', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\nb\n')).toBe(2);
  });
});
