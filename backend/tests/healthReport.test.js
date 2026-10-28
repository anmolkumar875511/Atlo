import { describe, expect, it } from 'vitest';
import { buildHealthReport, percentileRanks } from '../src/models/healthReport.js';

const node = (id, complexity, fanIn, fanOut, blastRadius = 0) => ({
  id,
  complexity,
  fanIn,
  fanOut,
  blastRadius,
});

describe('percentileRanks', () => {
  it('ranks values from lowest to highest, with the top value at 1', () => {
    expect(percentileRanks([10, 30, 20])).toEqual([1 / 3, 1, 2 / 3]);
  });

  it('gives tied values the same average rank', () => {
    const ranks = percentileRanks([5, 5, 9]);
    expect(ranks[0]).toBe(ranks[1]);
    expect(ranks[0]).toBeCloseTo(1.5 / 3);
    expect(ranks[2]).toBe(1);
  });

  it('handles an empty list', () => {
    expect(percentileRanks([])).toEqual([]);
  });
});

describe('buildHealthReport', () => {
  const nodes = [
    node('core.js', 40, 8, 2), // complex, tightly coupled
    node('util.js', 5, 6, 0),
    node('leaf.js', 3, 0, 1),
    node('island.js', 9, 0, 0), // not connected to anything
  ];

  it('scores churn x complexity x (fanIn + fanOut) and ranks files 0..1', () => {
    const churn = {
      available: true,
      counts: new Map([
        ['core.js', 30],
        ['util.js', 10],
        ['leaf.js', 2],
        ['island.js', 50],
      ]),
      commits: 60,
      windowDays: 365,
    };
    const report = buildHealthReport({ nodes, churn });

    expect(report.basis).toBe('churn');
    const byId = Object.fromEntries(report.files.map((f) => [f.id, f]));
    expect(byId['core.js'].godScore).toBe(1); // 30 x 40 x 10 = 12000, the biggest
    expect(byId['core.js'].churn).toBe(30);
    expect(byId['util.js'].godScore).toBeGreaterThan(byId['leaf.js'].godScore);
    expect(byId['island.js'].godScore).toBe(0); // churns a lot but nothing depends on it
    expect(report.hotspots.map((h) => h.id)).toEqual(['core.js', 'util.js', 'leaf.js']);
    expect(report.hotspots[0]).toMatchObject({ complexity: 40, fanIn: 8, fanOut: 2, churn: 30 });
  });

  it('gives 0 to a file that never changed', () => {
    const churn = { available: true, counts: new Map([['core.js', 3]]), commits: 3 };
    const { files } = buildHealthReport({ nodes, churn });
    expect(files.find((f) => f.id === 'util.js')).toMatchObject({ churn: 0, godScore: 0 });
  });

  it('falls back to a structural score when git history is unavailable', () => {
    const report = buildHealthReport({
      nodes,
      churn: { available: false, reason: 'git-missing' },
    });
    expect(report.basis).toBe('structural');
    expect(report.churn).toMatchObject({ available: false, reason: 'git-missing' });
    expect(report.files.every((f) => f.churn === null)).toBe(true);
    expect(report.hotspots[0].id).toBe('core.js'); // 40 x 10 beats the rest
  });

  it('caps the hotspot list at 10', () => {
    const many = Array.from({ length: 25 }, (_, i) => node(`f${i}.js`, 5 + i, 1 + i, 1));
    const report = buildHealthReport({ nodes: many, churn: { available: false } });
    expect(report.hotspots).toHaveLength(10);
  });
});
