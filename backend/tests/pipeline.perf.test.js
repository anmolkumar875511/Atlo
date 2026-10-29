import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, makeZip } from './helpers.js';

// A generated 1,500-file repository pushed through the real HTTP pipeline. It checks that the
// answer is RIGHT at scale (counts known by construction) and that nothing got accidentally
// quadratic. Budgets are generous (CI machines are slow); the benchmarks give the real numbers.
function syntheticRepo({ jsFiles, pyFiles }) {
    const files = {};
    const dir = (i) => `pkg${i % 30}`;
    for (let i = 0; i < jsFiles; i += 1) {
        const next = (i + 1) % jsFiles;
        const far = (i * 7 + 3) % jsFiles;
        files[`${dir(i)}/m${i}.js`] =
            `import { f${next} } from '../${dir(next)}/m${next}.js';\n` +
            `import { f${far} } from '../${dir(far)}/m${far}.js';\n` +
            `export function f${i}(a) {\n  if (a > ${i}) return f${next}(a) + f${far}(a);\n  return a;\n}\n`;
    }
    for (let d = 0; d < 10; d += 1) files[`py${d}/__init__.py`] = '';
    for (let i = 0; i < pyFiles; i += 1) {
        const d = i % 10;
        const prev = Math.max(0, i - 10); // imports the previous module of the same package
        files[`py${d}/mod${i}.py`] =
            (i >= 10 ? `from . import mod${prev}\n` : '') +
            `def g${i}(x):\n    return x + 1 if x else 0\n`;
    }
    return files;
}

describe('large synthetic repository', () => {
    const JS = 1200;
    const PY = 300;
    const files = syntheticRepo({ jsFiles: JS, pyFiles: PY });

    it('analyzes correctly and quickly', async () => {
        const app = buildTestApp({ download: async () => makeZip(files) });
        const started = performance.now();
        const res = await request(app).post('/api/analyze').send({ url: 'big/repo' });
        const ms = performance.now() - started;

        expect(res.status).toBe(200);
        const { graph } = res.body.data;

        // Counts that follow from how the repository was generated.
        expect(graph.stats.nodes).toBe(
            JS + PY + 10 /* empty __init__.py files count as Python files */
        );
        const jsEdges = graph.edges.filter((e) => e.source.endsWith('.js'));
        expect(jsEdges.length).toBe(JS * 2);
        expect(graph.edges.filter((e) => e.source.endsWith('.py')).length).toBe(PY - 10);
        expect(graph.stats.unresolved).toBe(0);

        // m(i) -> m(i+1) closes one big ring, so all 1,200 JS files are one circular group.
        const biggest = graph.cycles[0];
        expect(biggest.size).toBe(JS);
        expect(graph.nodes.find((n) => n.id === 'pkg0/m0.js').blastRadius).toBe(JS - 1);

        // The Python chain is acyclic: mod0 is imported by mod10, which is imported by mod20, ...
        const py = (i) => graph.nodes.find((n) => n.id === `py${i % 10}/mod${i}.py`);
        expect(py(0).blastRadius).toBe(Math.floor((PY - 1 - 0) / 10));
        expect(py(PY - 10).blastRadius).toBe(0);

        expect(res.body.data.onboarding.path.length).toBeGreaterThan(0);
        expect(ms).toBeLessThan(15_000);
        const t = graph.stats.timings;
        expect(t.algorithmsMs + t.callsMs + t.onboardingMs + t.graphMs).toBeLessThan(3000);
    }, 30_000);

    it('serves file and search requests fast once analyzed', async () => {
        const app = buildTestApp({ download: async () => makeZip(files) });
        const { id } = (await request(app).post('/api/analyze').send({ url: 'big/repo' })).body
            .data;

        const started = performance.now();
        for (let i = 0; i < 50; i += 1) {
            await request(app)
                .get(`/api/repos/${id}/files?path=pkg${i % 30}/m${i}.js`)
                .expect(200);
            await request(app).get(`/api/repos/${id}/search?q=f${i}`).expect(200);
        }
        expect((performance.now() - started) / 100).toBeLessThan(50); // ms per request, on average
    }, 60_000);
});
