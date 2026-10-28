import { describe, expect, it } from 'vitest';
import { complexityLevel, LEVEL_LABELS } from './complexity.js';

describe('complexityLevel', () => {
  it.each([
    [1, 'low'],
    [10, 'low'],
    [11, 'moderate'],
    [20, 'moderate'],
    [21, 'high'],
    [50, 'high'],
    [51, 'severe'],
    [500, 'severe'],
  ])('%i is %s', (value, level) => {
    expect(complexityLevel(value)).toBe(level);
  });

  it('has a label for every level', () => {
    expect(Object.keys(LEVEL_LABELS)).toEqual(['low', 'moderate', 'high', 'severe']);
  });
});
