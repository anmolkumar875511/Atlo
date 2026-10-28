import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, plural } from './format.js';

describe('format helpers', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [20 * 1024, '20 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [-1, '—'],
    [NaN, '—'],
  ])('formatBytes(%s) = %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('formatDuration', () => {
    expect(formatDuration(420)).toBe('420 ms');
    expect(formatDuration(2300)).toBe('2.3 s');
    expect(formatDuration(undefined)).toBe('—');
  });

  it('plural', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(0, 'file')).toBe('0 files');
    expect(plural(1234, 'file')).toBe('1,234 files');
  });
});
