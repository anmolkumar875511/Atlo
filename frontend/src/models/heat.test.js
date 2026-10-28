import { describe, expect, it } from 'vitest';
import { churnReason, heatColor } from './heat.js';

describe('heatColor', () => {
  it('runs from green through gold to oxblood', () => {
    expect(heatColor(0)).toBe('#5f8a6a');
    expect(heatColor(0.5)).toBe('#d8b864');
    expect(heatColor(1)).toBe('#b0304a');
  });

  it('blends between the stops', () => {
    expect(heatColor(0.25)).toBe('#9ca167');
  });

  it('clamps and tolerates bad input', () => {
    expect(heatColor(7)).toBe(heatColor(1));
    expect(heatColor(-3)).toBe(heatColor(0));
    expect(heatColor(undefined)).toBe(heatColor(0));
    expect(heatColor(NaN)).toBe(heatColor(0));
  });
});

describe('churnReason', () => {
  it('explains known reasons and has a fallback', () => {
    expect(churnReason('git-missing')).toMatch(/not installed/);
    expect(churnReason('???')).toMatch(/unavailable/);
  });
});
