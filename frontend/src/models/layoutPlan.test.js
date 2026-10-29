import { describe, expect, it } from 'vitest';
import { layoutInput, toPositions } from './layoutPlan.js';

describe('layoutInput', () => {
  const elements = [
    { group: 'nodes', data: { id: 'a', label: 'a.js', color: '#fff', size: 12 }, classes: '' },
    {
      group: 'nodes',
      data: { id: 'b', label: 'b.js', color: '#fff', size: 8 },
      classes: 'in-cycle',
    },
    { group: 'edges', data: { id: 'a->b', source: 'a', target: 'b' } },
    { group: 'edges', data: { id: 'call:a->b', source: 'a', target: 'b' }, classes: 'call' },
  ];

  it('keeps only what positions depend on', () => {
    expect(layoutInput(elements)).toEqual({
      nodes: [
        { id: 'a', size: 12 },
        { id: 'b', size: 8 },
      ],
      edges: [{ source: 'a', target: 'b' }],
    });
  });

  it('leaves call links out, so hidden links do not pull files together', () => {
    expect(layoutInput(elements).edges).toHaveLength(1);
  });
});

describe('toPositions', () => {
  it('turns the worker arrays into an id -> point map', () => {
    expect(toPositions(['a', 'b'], new Float64Array([1, 3]), new Float64Array([2, 4]))).toEqual({
      a: { x: 1, y: 2 },
      b: { x: 3, y: 4 },
    });
  });
});
