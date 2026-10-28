import { describe, expect, it } from 'vitest';
import { buildOnboarding, isTestPath, stemOf } from '../src/models/onboarding.js';

const node = (id, over = {}) => ({
  id,
  lines: 40,
  complexity: 8,
  fanIn: 0,
  fanOut: 0,
  blastRadius: 0,
  ...over,
});
const edge = (source, target) => ({ source, target, type: 'import' });

describe('isTestPath / stemOf', () => {
  it.each([
    ['src/a.test.js', true],
    ['src/a.spec.ts', true],
    ['tests/helpers.js', true],
    ['pkg/__tests__/x.js', true],
    ['pkg/test_models.py', true],
    ['pkg/models_test.py', true],
    ['src/a.js', false],
    ['src/latest.js', false],
  ])('%s -> %s', (path, expected) => {
    expect(isTestPath(path)).toBe(expected);
  });

  it('pairs a file with its test by name', () => {
    expect(stemOf('src/math.test.js')).toBe('math');
    expect(stemOf('tests/test_math.py')).toBe('math');
    expect(stemOf('src/Math.js')).toBe('math');
  });
});

describe('buildOnboarding', () => {
  const nodes = [
    node('core.js', { complexity: 90, fanIn: 5, blastRadius: 5, lines: 300 }),
    node('a.js', { blastRadius: 1 }),
    node('b.js', { blastRadius: 1 }),
    node('helper.js', { complexity: 3, blastRadius: 0, lines: 30 }),
    node('helper.test.js', { lines: 20 }),
    node('tiny.js', { lines: 2, complexity: 1 }),
    node('hub.js', { complexity: 40, fanIn: 4, blastRadius: 4 }),
  ];
  const edges = [
    edge('a.js', 'core.js'),
    edge('b.js', 'core.js'),
    edge('hub.js', 'core.js'),
    edge('helper.test.js', 'helper.js'),
    edge('a.js', 'hub.js'),
  ];
  const result = buildOnboarding({ nodes, edges, analyses: new Map() });

  it('never suggests a test file', () => {
    expect(result.starters.some((s) => s.id.includes('.test.'))).toBe(false);
  });

  it('ranks a small, simple file with a test first', () => {
    expect(result.starters[0].id).toBe('helper.js');
    expect(result.starters[0].testFile).toBe('helper.test.js');
    expect(result.starters[0].reasons.join(' ')).toMatch(/Has a test/);
  });

  it('ranks the complex, heavily used core file last', () => {
    expect(result.starters.at(-1).id).toBe('core.js');
    expect(result.starters[0].score).toBeGreaterThan(result.starters.at(-1).score);
  });

  it('down-weights tiny files', () => {
    const tiny = result.starters.find((s) => s.id === 'tiny.js');
    const similar = result.starters.find((s) => s.id === 'a.js');
    expect(tiny.score).toBeLessThan(similar.score + 0.4);
  });

  it('builds a path that moves from easy files toward the core', () => {
    const stages = result.path.map((p) => p.stage);
    expect(stages[0]).toBe('warm-up');
    expect(stages.at(-1)).toBe('core');
    expect(new Set(result.path.map((p) => p.id)).size).toBe(result.path.length); // no repeats
    expect(result.path.find((p) => p.stage === 'core').id).toBe('core.js');
    const order = ['warm-up', 'connect', 'core'];
    expect(stages.map((s) => order.indexOf(s))).toEqual(
      [...stages.map((s) => order.indexOf(s))].sort(),
    );
  });

  it('copes with an empty graph', () => {
    expect(buildOnboarding({ nodes: [], edges: [], analyses: new Map() })).toEqual({
      starters: [],
      path: [],
    });
  });
});
