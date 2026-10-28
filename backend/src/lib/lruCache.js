// Small in-memory LRU cache with a TTL. A JS Map keeps insertion order, so the
// first key is always the least recently used one: get/set are O(1).
export class LruCache {
    constructor({ maxEntries, ttlMs, now = Date.now }) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.now = now;
        this.store = new Map();
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.store.delete(key);
            return undefined;
        }
        // Re-insert to mark as most recently used.
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }

    set(key, value) {
        this.store.delete(key);
        this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next().value;
            if (oldest === undefined) break;
            this.store.delete(oldest);
        }
    }

    delete(key) {
        return this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }

    get size() {
        return this.store.size;
    }
}
