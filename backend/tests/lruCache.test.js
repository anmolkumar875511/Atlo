import { describe, expect, it } from 'vitest';
import { LruCache } from '../src/lib/lruCache.js';

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new LruCache({ maxEntries: 2, ttlMs: 1000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now newest
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('expires entries after the TTL', () => {
    let now = 0;
    const cache = new LruCache({ maxEntries: 5, ttlMs: 100, now: () => now });
    cache.set('a', 1);
    now = 99;
    expect(cache.get('a')).toBe(1);
    now = 200;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
