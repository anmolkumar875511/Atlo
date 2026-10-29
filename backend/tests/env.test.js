import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
    it('applies defaults', () => {
        const c = loadConfig({});
        expect(c.port).toBe(4000);
        expect(c.limits.maxFileBytes).toBe(1024 * 1024);
        expect(c.corsOrigins).toEqual(['http://localhost:5173']);
    });

    it('coerces numbers and splits origins', () => {
        const c = loadConfig({ PORT: '8080', CORS_ORIGIN: 'http://a.com, http://b.com' });
        expect(c.port).toBe(8080);
        expect(c.corsOrigins).toEqual(['http://a.com', 'http://b.com']);
    });

    it('fails fast with a readable message', () => {
        expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    });
});

describe('worker and churn settings', () => {
    it('parses inline in tests and turns git history off', () => {
        const config = loadConfig({ NODE_ENV: 'test' });
        expect(config.workers.count).toBe(0);
        expect(config.churn.enabled).toBe(false);
    });

    it('accepts an explicit worker count and rejects nonsense', () => {
        expect(loadConfig({ NODE_ENV: 'production', WORKER_THREADS: '3' }).workers.count).toBe(3);
        expect(loadConfig({ NODE_ENV: 'production', WORKER_THREADS: '0' }).workers.count).toBe(0);
        expect(() => loadConfig({ WORKER_THREADS: 'lots' })).toThrow(/WORKER_THREADS/);
    });

    it('can switch churn off in production', () => {
        expect(loadConfig({ NODE_ENV: 'production' }).churn.enabled).toBe(true);
        expect(loadConfig({ NODE_ENV: 'production', CHURN_ENABLED: 'false' }).churn.enabled).toBe(
            false
        );
    });
});
